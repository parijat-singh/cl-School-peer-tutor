# Security & Privacy — PeerTutor

## Purpose

Document the security model, data classification, multi-tenancy enforcement, credential management, and incident response procedures for the PeerTutor platform.

---

## Data Classification

| Class | Description | Examples |
|-------|-------------|---------|
| **Secret** | Must never be logged, stored client-side, or committed | SMTP password, Google Calendar private key, Anthropic API key, Cognito client secret, AWS IAM keys |
| **Sensitive** | Visible only to the owning user or authorised admins | Email address, session history, ratings given, booking details |
| **School-scoped** | Visible to all users within a school | Tutor name, subjects, availability, average rating |
| **Public** | Visible without authentication | Landing page content, school name, contact form |

---

## Authentication

### Cognito Token Flow

1. User authenticates with Cognito (`InitiateAuth` → `AuthenticationResult`)
2. Three tokens returned: **ID token**, **access token**, **refresh token**
3. ID token contains custom claims: `custom:role`, `custom:schoolDomain`, `custom:status`
4. Tokens are stored **in memory only** — the refresh token alone is persisted to `localStorage`
5. ID token is sent as `Authorization: Bearer <token>` on every API request
6. API Gateway JWT authorizer validates signature + audience before any Lambda code runs
7. Lambda extracts claims via `getAuth(event)` — trusts the gateway-validated token

### Token Lifetime

| Token | Lifetime |
|-------|---------|
| ID token | 1 hour |
| Access token | 1 hour |
| Refresh token | 30 days |

Auto-refresh is scheduled 5 minutes before ID token expiry. On `401` from the API, the client retries once after refreshing.

### Sign-Out

`cognitoSignOut()` calls `GlobalSignOut` — this revokes all refresh tokens for the user across all devices. In-flight ID tokens remain valid until natural expiry (max 1 hour).

### User Suspension

When a school admin suspends a user:
1. Cognito account is disabled (`AdminDisableUser`) — prevents new sign-ins immediately
2. DynamoDB user record is updated (`status: "suspended"`)
3. Immutable entry is written to `peertutor-admin-audit-log`

Existing tokens remain valid until expiry, but the API checks `status` on sensitive operations.

---

## Multi-Tenancy Enforcement

School isolation is enforced at two independent layers — both must be bypassed for a cross-school breach to occur.

### Layer 1 — JWT Claims

Every Cognito ID token carries `custom:schoolDomain`. The Lambda `getAuth(event)` helper extracts this claim and injects it into all database operations. A token minted for `lincoln.edu` cannot present `schoolDomain=jefferson.edu` without forging the JWT signature (mitigated by API Gateway validation).

### Layer 2 — DynamoDB Schema

Every user-scoped table has a `SchoolDomainIndex` GSI keyed on `schoolDomain`. All queries that enumerate users, sessions, slots, or reviews **must** include a `schoolDomain` filter condition. Omitting it returns zero results, not a cross-school data set.

### Superadmin Bypass

Superadmin-only endpoints (e.g., `GET /schools`, `POST /schools/approve`) are gated by `role === "superadmin"` in Lambda and do not apply school-domain filtering. These endpoints are not accessible to school-level users.

---

## Credential Management

| Credential | Where Stored | Who Can Access |
|-----------|-------------|---------------|
| SMTP password | GitHub Actions Secret + Lambda env var | CI/CD pipeline + Lambda runtime |
| Google Calendar private key | GitHub Actions Secret + Lambda env var | CI/CD pipeline + Lambda runtime |
| Anthropic API key | GitHub Actions Secret + Lambda env var | CI/CD pipeline + Lambda runtime |
| AWS IAM deploy key | GitHub Actions Secret (per environment) | CI/CD pipeline only |
| Cognito User Pool ID / Client ID | GitHub Actions Variable (non-secret) + Vite build | Frontend + Lambda |
| `.env` files | Local only — `.gitignore` enforced | Developer machine only |

**Rules:**
- Secrets are never committed to source control (Gitleaks scans every push)
- Production and staging secrets are in separate GitHub Environments — a staging deploy cannot access production secrets
- Lambda environment variables are injected at deploy time via Terraform / GitHub Actions

---

## Transport Security

| Layer | Control |
|-------|---------|
| Browser → CloudFront | TLS 1.2+ enforced; HTTP redirected to HTTPS |
| CloudFront → S3 | Origin Access Control (OAC); S3 bucket blocks public access |
| Browser → API Gateway | TLS 1.2+ enforced |
| Lambda → DynamoDB | AWS private network (no public internet) |
| Lambda → SMTP | TLS (STARTTLS on port 587) |
| Lambda → Google Calendar | HTTPS |
| Lambda → Anthropic | HTTPS |

---

## Encryption at Rest

| Storage | Encryption |
|---------|-----------|
| DynamoDB | AWS-managed AES-256 (default) |
| S3 (frontend assets) | AWS-managed SSE-S3 |
| S3 (school logos) | AWS-managed SSE-S3 |
| Cognito (passwords) | Managed by AWS (SRP protocol — plaintext never transmitted) |

---

## Rate Limiting

| Layer | Limit | Implementation |
|-------|-------|---------------|
| Nginx (local dev) | 30 req/min per IP | `limit_req` directive |
| API Gateway | Configurable burst/rate | AWS-managed throttling |
| Booking actions | 10 per user per minute | DynamoDB sliding-window (`peertutor-rate-limits`) |

---

## Audit Trail

The `peertutor-admin-audit-log` table records every privileged action taken by school admins and superadmins:

- User suspension / unsuspension
- Role promotion / demotion
- Review deletion
- School approval / rejection
- Branding updates

**Immutability guarantee:** There are no Lambda endpoints that `DeleteItem` or `UpdateItem` on `peertutor-admin-audit-log`. The table is append-only by design.

---

## Frontend Security

| Control | Detail |
|---------|--------|
| No tokens in `localStorage` | ID and access tokens held in memory only |
| No sensitive data in URLs | JWTs passed via `Authorization` header, not query strings |
| Content Security Policy | Set via Nginx headers |
| XSS mitigation | React DOM escapes by default; no `dangerouslySetInnerHTML` usage |
| CORS | API Gateway restricts `Origin` to known domains |

---

## Dependency Security

- `npm audit --audit-level=high` runs in CI on both frontend and Lambda dependencies
- Any high-severity vulnerability blocks the build and prevents deployment
- Moderate vulnerabilities that require breaking changes are tracked as known exceptions in commit messages

---

## Incident Response

### Suspected Credential Leak

1. Rotate the affected credential immediately (AWS IAM, SMTP, Google, Anthropic)
2. Update the secret in GitHub Actions Environments
3. Trigger a re-deploy to push the new credential to Lambda
4. Review `peertutor-admin-audit-log` and CloudWatch logs for any anomalous actions
5. Notify affected parties if user data was accessed

### Suspected Cross-Tenant Access

1. Pull CloudWatch logs for the suspicious Lambda invocations
2. Extract the JWT `schoolDomain` claim from the logs
3. Compare against the DynamoDB query conditions in the same request
4. If breach confirmed: suspend affected accounts, rotate Cognito app client secret, notify school admins

### Compromised User Account

1. School admin suspends user via AdminDashboard (`AdminDisableUser` in Cognito)
2. All active sessions terminated (GlobalSignOut)
3. Audit log entry created automatically
4. School admin can review the user's session history

---

## Known Accepted Risks

| Risk | Mitigation | Accepted Because |
|------|-----------|-----------------|
| ID tokens valid up to 1 hour after `GlobalSignOut` | Short token lifetime (1 hour max) | AWS Cognito does not support immediate ID token revocation |
| Moderate npm vulnerabilities (esbuild, vite, nodemailer) | Tracked; `--force` upgrade breaks test suite | Dev-only tooling, not runtime attack surface |

---

## Related Docs

- `ARCHITECTURE.md` — system design context
- `DATA_MODEL.md` — table structure and access patterns
- `DEPLOYMENT_ENVIRONMENTS.md` — secret scoping per environment
