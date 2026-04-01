# Deployment Environments — PeerTutor

## Purpose

Document the staging and production environment model, GitHub Environments configuration, AWS resource separation, and the promotion flow from code to deployed infrastructure.

---

## Environment Summary

| Environment | Branch | URL | AWS Account | Purpose |
|-------------|--------|-----|-------------|---------|
| **Production** | `master` | `schoolpeertutor.com` (or CloudFront domain) | Shared | Live user traffic |
| **Staging** | `develop` | `test.schoolpeertutor.com` (or CloudFront domain) | Shared | Pre-release validation |
| **Local** | N/A | `http://localhost:5173` | N/A | Developer testing |

---

## GitHub Environments

Two GitHub Environments are configured on the repository: `staging` and `production`. Each has its own scoped secrets — a staging deploy cannot read production secrets and vice versa.

### Environment: `production`

| Secret / Variable | Type | Description |
|-------------------|------|-------------|
| `AWS_ACCESS_KEY_ID` | Secret | IAM deploy key for production |
| `AWS_SECRET_ACCESS_KEY` | Secret | IAM deploy key for production |
| `AWS_REGION` | Variable | `us-east-1` |
| `S3_BUCKET` | Variable | Frontend S3 bucket name |
| `CLOUDFRONT_DISTRIBUTION_ID` | Secret | CloudFront distribution to invalidate |
| `LAMBDA_DEPLOY_BUCKET` | Variable | S3 bucket for Lambda zip artifacts |
| `VITE_COGNITO_USER_POOL_ID` | Variable | Production Cognito pool |
| `VITE_COGNITO_CLIENT_ID` | Variable | Production Cognito client |
| `VITE_API_URL` | Variable | Production API Gateway URL |
| `VITE_SENTRY_DSN` | Secret | Sentry DSN for frontend |
| `COGNITO_USER_POOL_ID` | Variable | Lambda env — Cognito pool |
| `COGNITO_APP_CLIENT_ID` | Variable | Lambda env — Cognito client |
| `SMTP_HOST` | Variable | SMTP hostname |
| `SMTP_PORT` | Variable | `587` |
| `SMTP_USER` | Secret | SMTP username |
| `SMTP_PASS` | Secret | SMTP password |
| `SMTP_FROM_EMAIL` | Variable | Sender email address |
| `SMTP_FROM_NAME` | Variable | Sender display name |
| `GOOGLE_CALENDAR_CLIENT_EMAIL` | Secret | Google service account email |
| `GOOGLE_CALENDAR_PRIVATE_KEY` | Secret | Google Calendar private key |
| `GOOGLE_CALENDAR_ID` | Variable | `primary` |
| `ANTHROPIC_API_KEY` | Secret | Anthropic Claude API key |
| `LOGOS_BUCKET_NAME` | Variable | S3 bucket for school logos |
| `SENTRY_DSN` | Secret | Sentry DSN for Lambda |
| `SUPER_ADMIN_EMAIL` | Variable | Platform super admin email |

### Environment: `staging`

Same set of secrets/variables as production, scoped to staging AWS resources, staging Cognito pool, and staging API Gateway URL.

---

## AWS Resource Separation

Production and staging share an AWS account but use separate named resources:

| Resource | Production | Staging |
|----------|-----------|---------|
| DynamoDB tables | `peertutor-*` | `peertutor-staging-*` |
| Lambda functions | `pt-auth`, `pt-bookings`, … | `pt-staging-auth`, … |
| API Gateway | Production HTTP API | Staging HTTP API |
| Cognito User Pool | Production pool | Staging pool (separate users) |
| S3 frontend bucket | `peertutor-frontend-prod-*` | `peertutor-frontend-staging-*` |
| CloudFront | Production distribution | Staging distribution |
| S3 logos bucket | `peertutor-logos-prod-*` | `peertutor-logos-staging-*` |

> Naming is controlled by the `environment` Terraform variable and the `local.name_prefix` local value.

---

## Promotion Flow

```
Developer → feature branch
  │
  └── PR → develop
        │
        ├── CI runs (scan, audit, SAST, unit tests, integration tests)
        │
        └── On CI pass: CD deploys to STAGING
              │
              └── Manual verification on staging
                    │
                    └── PR: develop → master
                          │
                          ├── CI runs again
                          │
                          └── On CI pass: CD deploys to PRODUCTION
```

There is no manual approval gate between CI pass and CD deploy. CI passing on `master` immediately triggers a production deploy. If a deployment needs to be blocked, prevent the merge to `master`.

---

## Deployment Steps (CD Workflow)

### Frontend

1. Determine environment from branch (`master` → production, `develop` → staging)
2. `npm ci` in `frontend/`
3. `npm run build` — Vite compiles with `VITE_*` vars injected from GitHub Actions secrets
4. `aws s3 sync dist/ s3://$S3_BUCKET --delete`
5. `aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_DISTRIBUTION_ID --paths "/*"`

### Lambda Functions

1. `scripts/build-lambdas.sh` — esbuild compiles each of the 6 handler groups to a single JS file
2. Each handler group is zipped: `pt-auth.zip`, `pt-bookings.zip`, etc.
3. Zips uploaded to `s3://$LAMBDA_DEPLOY_BUCKET/`
4. `aws lambda update-function-code` called for each function

### Environment Variables on Lambda

Lambda env vars are **not** updated by the CD workflow on every deploy — they are set once by Terraform and only changed when secrets rotate or new variables are added. To update Lambda env vars without a full `terraform apply`, use:

```bash
aws lambda update-function-configuration \
  --function-name pt-auth \
  --environment "Variables={SMTP_PASS=newpassword,...}"
```

---

## Rollback

### Frontend Rollback

S3 + CloudFront do not retain previous build artifacts by default. To roll back:

1. Re-run the CD workflow on the previous commit (trigger via `git revert` + push, or re-run from GitHub Actions UI)
2. Alternatively, if S3 versioning is enabled, restore the previous object versions manually

### Lambda Rollback

Lambda retains the last deployed code version. To roll back to the previous version:

```bash
aws lambda update-function-code \
  --function-name pt-auth \
  --s3-bucket $LAMBDA_DEPLOY_BUCKET \
  --s3-key pt-auth-previous.zip
```

Or use Lambda versioning / aliases if configured.

---

## Infrastructure Changes

Infrastructure changes (new tables, Lambda config, Cognito settings) require a Terraform apply, which is **not** automatic — it is a deliberate manual step:

```bash
cd infra/terraform
terraform plan -var="environment=production" -var-file="prod.tfvars"
terraform apply -var="environment=production" -var-file="prod.tfvars"
```

Terraform state is stored remotely (S3 backend). Never run `terraform apply` locally against production without reviewing the plan output first.

---

## Environment-Specific Behaviours

| Behaviour | Local | Staging | Production |
|-----------|-------|---------|-----------|
| DynamoDB | DynamoDB Local (in-memory, Docker) | AWS DynamoDB (staging tables) | AWS DynamoDB (prod tables) |
| Cognito | Production pool (auth only) | Staging pool | Production pool |
| Email | Disabled (no SMTP configured) | Staging SMTP (test inbox) | Production SMTP |
| Google Meet | Disabled | Optional | Enabled |
| Sentry | Disabled | Optional | Enabled |
| CloudFront | None (direct Vite) | Staging distribution | Production distribution |

---

## Related Docs

- `GITHUB_SETUP.md` — repository secrets, branch protection, Actions configuration
- `CICD_OVERVIEW.md` — CI jobs and CD workflow steps
- `SETUP.md` — local dev bootstrap
