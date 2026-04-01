# Setup — PeerTutor

## Purpose

Bootstrap the PeerTutor project for local development, including environment variables, Docker services, and running tests.

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 22+ | Lambda dev + seed scripts |
| Docker Desktop | Latest | Frontend + DynamoDB Local + Nginx |
| AWS CLI | v2 | Seed scripts, Terraform, Lambda deploys |
| Terraform | 1.x | Infrastructure changes |
| Git | Any | Source control |

---

## 1. Clone & Install

```bash
git clone https://github.com/parijat-singh/cl-School-peer-tutor.git
cd cl-School-peer-tutor

# Root-level dev deps (Playwright, seed scripts, AWS SDK)
npm install

# Frontend deps
cd frontend && npm install && cd ..

# Lambda deps
cd backend/lambdas && npm install && cd ../..
```

---

## 2. Environment File

Create `.env` in the project root (never committed — in `.gitignore`):

```dotenv
# AWS Cognito (shared prod pool — auth only, safe for local dev)
VITE_COGNITO_USER_POOL_ID=us-east-1_QUDvlqnZV
VITE_COGNITO_CLIENT_ID=54l8t1isgh15adc38k0d9clh4d
VITE_AWS_REGION=us-east-1

# Backend API (AWS Lambda via API Gateway)
VITE_API_URL=https://dg0bm7enlc.execute-api.us-east-1.amazonaws.com

# Sentry (optional for local dev)
VITE_SENTRY_DSN=

# Super admin email (used by seed scripts)
SUPER_ADMIN_EMAIL=superadmin@peertutor.app
```

> **Note:** Local dev uses the production Cognito pool for authentication (sign-in/sign-up). DynamoDB data is local only (DynamoDB Local via Docker). API calls go to production Lambda unless you run the local Lambda server.

---

## 3. Start Docker Services

```bash
docker-compose up --build
```

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend (Vite) | http://localhost:5173 | React dev server with HMR |
| DynamoDB Local | http://localhost:8000 | Local database (in-memory, wiped on restart) |
| Nginx | http://localhost:80 | Reverse proxy |

To rebuild after env changes:

```bash
docker-compose down && docker-compose up --build
```

> Vite bakes `VITE_*` variables into the bundle at **start time**, not runtime. Always restart the frontend container after changing `.env`.

---

## 4. Seed Local Test Data

After Docker is running, populate DynamoDB Local with a full test bed:

```bash
node seed-testbed.mjs
```

This creates:
- 1 super admin: `superadmin@peertutor.app`
- 5 schools (lincoln.edu, jefferson.edu, roosevelt.edu, washingtonprep.edu, madison.edu)
- Per school: 2 admins, 5 tutors (3–5 availability slots each), 10 tutees (2 sessions each), 2 combo users
- All passwords: `Test1234!`

Full account listing: `testbed-accounts.csv` (gitignored — contains passwords).

---

## 5. Run Lambda Server Locally (Optional)

To hit local Lambda handlers instead of production API Gateway:

```bash
cd backend/lambdas
npm run dev
# Express mock server starts on http://localhost:3001
```

Then update `.env`:
```dotenv
VITE_API_URL=http://localhost:3001
```
And restart the frontend container.

The local Lambda server requires its own environment variables for DynamoDB, Cognito, and SMTP. Copy `.env.example` from `backend/lambdas/` and fill in values.

---

## 6. Run Tests

### Frontend Unit Tests

```bash
cd frontend
npm test              # Watch mode
npm run test:ci       # Single-run with coverage (CI mode)
```

Coverage thresholds: 80% statements, branches, functions, lines.

### Lambda Unit Tests

```bash
cd backend/lambdas
npm test              # Watch mode
npm run test:coverage # Single-run with coverage
```

### E2E Tests (Playwright)

Requires the frontend and API to be running (Docker + either local Lambda or production API).

```bash
# From project root
node e2e-test.mjs
```

Uses system Chrome. Tests cover: public pages, tutor/tutee sign-in, booking flow, sign-out, auth edge cases.

---

## 7. AWS CLI Configuration

Seed scripts and Terraform require AWS credentials with appropriate permissions.

```bash
aws configure
# AWS Access Key ID: <your key>
# AWS Secret Access Key: <your secret>
# Default region: us-east-1
# Default output format: json
```

Verify access:

```bash
aws cognito-idp list-user-pools --max-results 10
aws dynamodb list-tables
```

---

## 8. Terraform (Infrastructure Changes Only)

> Only needed if making infrastructure changes. Daily development does not require Terraform.

```bash
cd infra/terraform

# First time
terraform init

# Review changes
terraform plan -var="environment=staging"

# Apply
terraform apply -var="environment=staging"
```

Key variables:

| Variable | Default | Notes |
|----------|---------|-------|
| `environment` | `production` | `staging` or `production` |
| `ses_domain` | `""` | Optional — SES verified domain |
| `enable_waf` | `false` | Optional CloudFront WAF |
| `domain_name` | `""` | Optional custom domain |

---

## 9. Environment Variable Reference

### Frontend (`VITE_*` — baked at build time)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_COGNITO_USER_POOL_ID` | Yes | Cognito User Pool ID |
| `VITE_COGNITO_CLIENT_ID` | Yes | Cognito App Client ID |
| `VITE_AWS_REGION` | Yes | AWS region (`us-east-1`) |
| `VITE_API_URL` | Yes | API Gateway base URL |
| `VITE_SENTRY_DSN` | No | Sentry error tracking DSN |

### Lambda (set via Terraform / GitHub Actions)

| Variable | Description |
|----------|-------------|
| `COGNITO_USER_POOL_ID` | Cognito User Pool ID |
| `COGNITO_APP_CLIENT_ID` | Cognito App Client ID |
| `DYNAMODB_TABLE_USERS` | Table name: `peertutor-users` |
| `DYNAMODB_TABLE_AVAILABILITY_SLOTS` | Table name |
| `DYNAMODB_TABLE_SESSIONS` | Table name |
| `DYNAMODB_TABLE_BOOKING_REQUESTS` | Table name |
| `DYNAMODB_TABLE_REVIEWS` | Table name |
| `DYNAMODB_TABLE_SCHOOLS` | Table name |
| `DYNAMODB_TABLE_STATS` | Table name |
| `DYNAMODB_TABLE_EMAIL_VERIFICATIONS` | Table name |
| `DYNAMODB_TABLE_RATE_LIMITS` | Table name |
| `DYNAMODB_TABLE_ADMIN_AUDIT_LOG` | Table name |
| `DYNAMODB_TABLE_CONTACT_SUBMISSIONS` | Table name |
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | SMTP port (587) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password (secret) |
| `SMTP_FROM_EMAIL` | From address for emails |
| `SMTP_FROM_NAME` | From name for emails |
| `GOOGLE_CALENDAR_CLIENT_EMAIL` | Google service account email |
| `GOOGLE_CALENDAR_PRIVATE_KEY` | Google service account private key (secret) |
| `GOOGLE_CALENDAR_ID` | Calendar ID (`primary`) |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key (secret) |
| `LOGOS_BUCKET_NAME` | S3 bucket for school logos |
| `SENTRY_DSN` | Sentry DSN for Lambda error tracking |
| `SUPER_ADMIN_EMAIL` | Email address of the platform super admin |

---

## Common Issues

| Problem | Cause | Fix |
|---------|-------|-----|
| Login shows "Something went wrong" | `VITE_COGNITO_CLIENT_ID` empty in Vite | Restart containers after editing `.env` |
| API calls hit localhost:3001 | Old docker-compose had hardcoded URL | Ensure `VITE_API_URL` is set in `.env` |
| Docker build takes 10+ minutes | `node_modules` copied into build context | `frontend/.dockerignore` must exclude `node_modules` |
| Seed script: `ValidationException` on SchoolDomainIndex | `schoolDomain: null` in DynamoDB item | Use empty string or valid domain, never null on indexed attribute |
| DynamoDB local data lost after restart | In-memory mode — by design | Re-run `seed-testbed.mjs` after each Docker restart |

---

## Related Docs

- `ARCHITECTURE.md` — system overview
- `DEPLOYMENT_ENVIRONMENTS.md` — staging and production setup
- `GITHUB_SETUP.md` — repository secrets and branch protection
