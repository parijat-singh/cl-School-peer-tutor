# PeerTutor — Documentation Index

## Start Here

| Document | Purpose |
|----------|---------|
| `PROJECT_CHARTER.md` | Mission, problem, roles, constraints |
| `PRODUCT_REQUIREMENTS.md` | Feature scope, user flows, phases |
| `SETUP.md` | Local dev bootstrap, environment variables |

## Product & System

| Document | Purpose |
|----------|---------|
| `ARCHITECTURE.md` | AWS services, runtime model, service boundaries |
| `DATA_MODEL.md` | DynamoDB tables, indexes, document shapes |
| `SECURITY_PRIVACY.md` | Auth, multi-tenancy, data classification, audit |

## Delivery & Platform

| Document | Purpose |
|----------|---------|
| `DEPLOYMENT_ENVIRONMENTS.md` | Environments, secrets, promotion flow |
| `GITHUB_SETUP.md` | Repository setup, branch protection, secrets |
| `CICD_OVERVIEW.md` | CI/CD workflows, jobs, gates, deploy steps |

## History

| Document | Purpose |
|----------|---------|
| `DEFECT_LOG.md` | Resolved bugs, root causes, prevention notes |
| `SESSION_SUMMARIES.md` | Session logs, decisions, next steps |

---

## Document Hierarchy

```
PROJECT_CHARTER  →  problem + goals
PRODUCT_REQUIREMENTS  →  what to build
ARCHITECTURE + DATA_MODEL + SECURITY_PRIVACY  →  how to build it
SETUP + DEPLOYMENT_ENVIRONMENTS + GITHUB_SETUP + CICD_OVERVIEW  →  how to run it
DEFECT_LOG + SESSION_SUMMARIES  →  what happened
```

## Key Facts

- **Auth**: AWS Cognito (migrated from Firebase Auth)
- **Database**: DynamoDB (migrated from Firestore)
- **Backend**: AWS Lambda + API Gateway v2 (migrated from Cloud Functions)
- **Frontend**: React 18 + Vite + TypeScript on S3 + CloudFront
- **Multi-tenancy**: Enforced via JWT `schoolDomain` claim + DynamoDB GSI design
- **CI/CD**: GitHub Actions → master branch deploys to production
