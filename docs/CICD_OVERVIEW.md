# CI/CD Overview — PeerTutor

## Purpose

Document the continuous integration and continuous deployment pipeline: what runs on each push, what gates deployments, and how code moves from commit to live production.

---

## Goals

- Every push is scanned for secrets, CVEs, and security vulnerabilities before any code runs
- No code reaches production without passing unit, integration, and E2E tests
- Frontend and Lambda deployments are fully automated on `master`
- Coverage gates prevent test debt from accumulating silently

---

## Workflow Files

| File | Trigger | Environment |
|------|---------|-------------|
| `.github/workflows/ci.yml` | Push to any branch; PR | None (no deploy) |
| `.github/workflows/cd.yml` | `workflow_run` — CI success on `master` or `develop` | `production` or `staging` |

---

## CI Workflow — `.github/workflows/ci.yml`

### Job 1: `secret-scan` — Gitleaks

Scans the full commit diff for leaked credentials (API keys, passwords, tokens).

- Tool: `gitleaks/gitleaks-action@v2`
- Fails on: any pattern matching a secret
- Must pass before any other job runs

### Job 2: `dependency-scan` — npm audit

Runs `npm audit --audit-level=high` on both:
- `frontend/` (React + Vite + Vitest deps)
- `backend/lambdas/` (Lambda + Vitest deps)

- Fails on: any **high** or **critical** severity CVE
- Moderate/low vulnerabilities do not fail the build
- Known accepted exceptions documented in `SECURITY_PRIVACY.md`

### Job 3: `sast-scan` — CodeQL

Static analysis of TypeScript source code (frontend + Lambda).

- Queries: `security-and-quality`
- Autobuild: CodeQL builds both source trees
- Fails on: any security finding from CodeQL's security query pack

### Job 4: `unit-tests`

Runs Vitest unit tests with coverage gates on both codebases.

**Frontend:**
```bash
cd frontend && npm run test:ci
```
- Coverage gate: 80% statements, branches, functions, lines
- Excludes: `cognito.ts`, `cognito-auth.ts` (browser API, hard to mock)

**Lambda:**
```bash
cd backend/lambdas && npm run test:coverage
```
- Coverage gate: 80% on all metrics
- Uses `aws-sdk-client-mock` for DynamoDB, Cognito, S3

### Job 5: `integration-tests` — DynamoDB Local + E2E

Runs backend integration tests against a live DynamoDB Local instance, and frontend integration tests.

Steps:
1. Start Java 17 (required by DynamoDB Local)
2. Start DynamoDB Local (`java -jar DynamoDBLocal.jar -inMemory`)
3. Create tables and seed test data via scripts
4. Run backend integration tests
5. Run frontend integration tests

### Final Gate: `CI passed`

A terminal job that depends on all previous jobs. Sends a success notification. The CD workflow listens for this job's success event.

---

## CD Workflow — `.github/workflows/cd.yml`

Triggered automatically when `CI passed` succeeds on `master` (production) or `develop` (staging).

### Step 1: Resolve Environment

Determine which GitHub Environment to use based on the branch that triggered CI:

```
master  → production
develop → staging
```

### Step 2: Deploy Frontend

```bash
cd frontend
npm ci
npm run build   # Vite injects VITE_* vars from GitHub Actions secrets
aws s3 sync dist/ s3://$S3_BUCKET --delete
aws cloudfront create-invalidation \
  --distribution-id $CLOUDFRONT_DISTRIBUTION_ID \
  --paths "/*"
```

### Step 3: Deploy Lambda Functions

```bash
bash scripts/build-lambdas.sh   # esbuild → 6 JS bundles
# For each handler group:
zip pt-auth.zip pt-auth.js
aws s3 cp pt-auth.zip s3://$LAMBDA_DEPLOY_BUCKET/
aws lambda update-function-code \
  --function-name pt-auth \
  --s3-bucket $LAMBDA_DEPLOY_BUCKET \
  --s3-key pt-auth.zip
# Repeat for pt-bookings, pt-schools, pt-reviews, pt-misc, pt-scheduled
```

---

## Coverage Gates

Both frontend and Lambda must maintain ≥ 80% on all four metrics:

| Metric | Threshold |
|--------|-----------|
| Statements | 80% |
| Branches | 80% |
| Functions | 80% |
| Lines | 80% |

Falling below threshold fails the `unit-tests` job and blocks deployment.

---

## Notification

On CI failure, a notification email is sent via the `Notify: CI failed` job. On CI success, the `CI passed` job fires a success notification. Email recipients are configured in the workflow file.

---

## Deployment Duration

| Stage | Typical Duration |
|-------|----------------|
| Secret scan | ~7s |
| Dependency audit | ~15s |
| SAST (CodeQL) | ~80s |
| Unit tests (frontend + Lambda) | ~30s |
| Integration + E2E tests | ~35s |
| **Total CI** | **~3 minutes** |
| Frontend deploy (build + S3 + invalidate) | ~2 minutes |
| Lambda deploy (build + zip + upload × 6) | ~1 minute |
| **Total CD** | **~3 minutes** |

---

## Adding a New Lambda

When adding a new Lambda handler group:

1. Create `backend/lambdas/src/<name>/` with handler files
2. Add esbuild entry point in `scripts/build-lambdas.sh`
3. Add Terraform resource in `infra/lambda.tf`
4. Add API Gateway route in `infra/api-gateway.tf`
5. Add the new `update-function-code` step to `.github/workflows/cd.yml`

---

## Related Docs

- `GITHUB_SETUP.md` — Actions secrets, branch protection, environment config
- `DEPLOYMENT_ENVIRONMENTS.md` — environment model and promotion flow
- `ARCHITECTURE.md` — Lambda handler groups and routing
