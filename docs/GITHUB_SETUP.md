# GitHub Setup — PeerTutor

## Purpose

Document the repository configuration, branch protection rules, GitHub Actions setup, and secret/variable management for the PeerTutor project.

---

## Repository

| Property | Value |
|----------|-------|
| URL | `https://github.com/parijat-singh/cl-School-peer-tutor` |
| Default branch | `master` |
| Visibility | Private |

---

## Branch Model

| Branch | Purpose | Deploys To |
|--------|---------|-----------|
| `master` | Production-ready code | Production |
| `develop` | Integration branch for staging validation | Staging |
| `feature/*` | Individual feature work | — |
| `fix/*` | Bug fixes | — |
| `claude/*` | Claude Code worktrees (auto-created) | — |

Pull requests from feature/fix branches target `develop`. PRs from `develop` target `master` for production promotion.

---

## Branch Protection: `master`

Configure at: **Settings → Branches → Add rule → `master`**

| Rule | Setting |
|------|---------|
| Require a pull request before merging | Enabled |
| Required approving reviews | 1 |
| Dismiss stale reviews on new push | Enabled |
| Require status checks to pass | Enabled |
| Required status checks | `CI` (the final `CI passed` job) |
| Require branches to be up to date | Enabled |
| Do not allow bypassing | Enabled |

---

## Branch Protection: `develop`

| Rule | Setting |
|------|---------|
| Require status checks to pass | Enabled |
| Required status checks | `CI` |
| Allow force push | Disabled |

---

## GitHub Environments

Two environments control which secrets are available to which deploy:

### Creating an Environment

**Settings → Environments → New environment**

| Environment | Protection Rules |
|-------------|-----------------|
| `production` | Required reviewers: optional; deployment branch: `master` only |
| `staging` | Deployment branch: `develop` only |

---

## Secrets & Variables

### Repository-Level (available to all workflows)

No repository-level secrets are used. All secrets are scoped to environments to prevent cross-environment leakage.

### Environment: `production` — Secrets

| Secret Name | Description |
|-------------|-------------|
| `AWS_ACCESS_KEY_ID` | IAM deploy user access key |
| `AWS_SECRET_ACCESS_KEY` | IAM deploy user secret key |
| `CLOUDFRONT_DISTRIBUTION_ID` | Production CloudFront distribution |
| `SMTP_USER` | SMTP account username |
| `SMTP_PASS` | SMTP account password |
| `GOOGLE_CALENDAR_CLIENT_EMAIL` | Google service account email |
| `GOOGLE_CALENDAR_PRIVATE_KEY` | Google Calendar RSA private key |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key |
| `SENTRY_DSN` | Sentry DSN for Lambda error tracking |
| `VITE_SENTRY_DSN` | Sentry DSN for frontend error tracking |

### Environment: `production` — Variables (non-secret)

| Variable Name | Example Value |
|---------------|--------------|
| `AWS_REGION` | `us-east-1` |
| `S3_BUCKET` | `peertutor-frontend-prod-abc123` |
| `LAMBDA_DEPLOY_BUCKET` | `peertutor-lambda-deploy-prod` |
| `VITE_COGNITO_USER_POOL_ID` | `us-east-1_QUDvlqnZV` |
| `VITE_COGNITO_CLIENT_ID` | `54l8t1isgh15adc38k0d9clh4d` |
| `VITE_API_URL` | `https://dg0bm7enlc.execute-api.us-east-1.amazonaws.com` |
| `COGNITO_USER_POOL_ID` | `us-east-1_QUDvlqnZV` |
| `COGNITO_APP_CLIENT_ID` | `54l8t1isgh15adc38k0d9clh4d` |
| `SMTP_HOST` | `smtp-mail.outlook.com` |
| `SMTP_PORT` | `587` |
| `SMTP_FROM_EMAIL` | `noreply@schoolpeertutor.com` |
| `SMTP_FROM_NAME` | `PeerTutor` |
| `GOOGLE_CALENDAR_ID` | `primary` |
| `LOGOS_BUCKET_NAME` | `peertutor-logos-prod-abc123` |
| `SUPER_ADMIN_EMAIL` | `superadmin@peertutor.app` |

### Environment: `staging`

Same structure as production, pointing to staging AWS resources, staging Cognito pool, and staging API Gateway URL. Use `peertutor-staging-*` naming for resource names.

---

## IAM Deploy User

The GitHub Actions deploy user needs the following IAM permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject", "s3:DeleteObject", "s3:ListBucket", "s3:GetObject"
      ],
      "Resource": [
        "arn:aws:s3:::peertutor-frontend-prod-*",
        "arn:aws:s3:::peertutor-frontend-prod-*/*",
        "arn:aws:s3:::peertutor-lambda-deploy-prod",
        "arn:aws:s3:::peertutor-lambda-deploy-prod/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "cloudfront:CreateInvalidation"
      ],
      "Resource": "arn:aws:cloudfront::*:distribution/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration"
      ],
      "Resource": "arn:aws:lambda:us-east-1:*:function:pt-*"
    }
  ]
}
```

---

## GitHub Actions Workflow Files

| File | Trigger | Purpose |
|------|---------|---------|
| `.github/workflows/ci.yml` | Push to any branch, PR | Security scans, tests, build validation |
| `.github/workflows/cd.yml` | `workflow_run` on CI success | Deploy frontend + Lambda to AWS |

See `CICD_OVERVIEW.md` for full job breakdown.

---

## Gitleaks Configuration

Gitleaks scans every push for secrets. Configuration is in `.gitleaks.toml` (if present) or uses default rules. Any detected secret fails the `secret-scan` CI job and blocks the pipeline.

If a false positive is detected, add an allowlist entry to `.gitleaks.toml`:

```toml
[[allowlist.commits]]
commits = ["abc123"]  # commit hash to skip
```

---

## Dependabot

Configure at: **Settings → Security → Dependabot**

Recommended: enable Dependabot alerts for npm. Auto-PRs for patch/minor updates in `frontend/` and `backend/lambdas/` can be enabled but should be reviewed before merging, as they may affect the 80% test coverage gate.

---

## Related Docs

- `DEPLOYMENT_ENVIRONMENTS.md` — environment model and secret scoping
- `CICD_OVERVIEW.md` — workflow jobs and deployment steps
- `SECURITY_PRIVACY.md` — credential management policy
