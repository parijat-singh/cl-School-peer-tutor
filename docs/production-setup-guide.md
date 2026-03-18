# PeerTutor — Production setup guide

Step-by-step: **AWS (Terraform)**, **GitHub Secrets**, **Firebase**, **Firestore PITR**, **App Check / WAF**.

---

## Part 1: AWS (Terraform + IAM + GitHub Secrets)

### 1.1 Prerequisites

- AWS account; **Terraform** ≥ 1.0; **AWS CLI** configured.

### 1.2 Run Terraform

```powershell
cd infra/terraform
terraform init
terraform plan
terraform apply
```

Creates: S3, CloudFront (OAC, SPA errors), optional **custom domain + ACM**, optional **WAF**, IAM deploy user.

### 1.3 Custom domain + ACM (optional)

**Option A — Bring your own cert (external DNS):**

1. Request ACM certificate in **us-east-1** for `example.com` + `www.example.com`; validate via DNS at your registrar.
2. In `terraform.tfvars`:

```hcl
project_name         = "peertutor"
domain_name          = "schoolpeertutor.com"
acm_certificate_arn  = "arn:aws:acm:us-east-1:ACCOUNT:certificate/UUID"
enable_custom_domain = true
```

3. CNAME **schoolpeertutor.com** and **www** → CloudFront distribution domain.

**Option B — Terraform requests cert + Route 53 validation:**

```hcl
domain_name              = "schoolpeertutor.com"
create_acm_certificate   = true
route53_zone_id          = "Z0XXXXXXXX"   # hosted zone in same AWS account
enable_custom_domain     = true
```

Apply twice if needed until certificate is **ISSUED**, then CloudFront uses aliases.

**Option C — Cert only via Terraform, DNS elsewhere:** `create_acm_certificate = true`, leave `route53_zone_id` empty. Run `terraform output acm_certificate_validation_records`, add CNAMEs at DNS host, wait for ISSUED, set `acm_certificate_arn` and `enable_custom_domain = true`, `create_acm_certificate = false`, apply again.

### 1.4 WAF (optional)

In `terraform.tfvars`:

```hcl
enable_waf = true
```

Re-apply. See **[runbooks/app-check-and-waf.md](runbooks/app-check-and-waf.md)**.

### 1.5 GitHub Secrets — AWS

| Secret | Source |
|--------|--------|
| `AWS_ACCESS_KEY_ID` | IAM access key for `*-github-deploy` |
| `AWS_SECRET_ACCESS_KEY` | Same |
| `AWS_REGION` | e.g. `us-east-1` |
| `S3_BUCKET` | `terraform output -raw s3_bucket_name` |
| `CLOUDFRONT_DISTRIBUTION_ID` | `terraform output -raw cloudfront_distribution_id` |

---

## Part 2: GitHub Secrets — Firebase & Cloud Functions env

CD runs **`scripts/write-functions-deploy-env.mjs`**, which writes **`backend/functions/.env`** from the secrets below, then deploys **functions + Firestore rules + Firestore indexes + Storage**.

| Secret | Required | Notes |
|--------|----------|--------|
| `FIREBASE_TOKEN` | Yes | `firebase login:ci` |
| `FIREBASE_PROJECT_ID` | Yes | |
| `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, … | Yes | Frontend build + CD |
| `SENTRY_DSN` | Recommended | Backend Sentry |
| `SMTP_PASS`, `SMTP_FROM_EMAIL`, `SUPER_ADMIN_EMAIL` | Yes* | *Resend: `SMTP_USER` often `resend` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_FROM_NAME` | Optional | Defaults work for Resend |
| `GOOGLE_CALENDAR_CLIENT_EMAIL`, `GOOGLE_CALENDAR_PRIVATE_KEY` | Optional | Google Meet links |
| `GOOGLE_CALENDAR_ID` | Optional | Default `primary` |
| `ANTHROPIC_API_KEY` | Optional | Tutor recommendations |
| `VITE_RECAPTCHA_SITE_KEY` | Optional | App Check (before enforcement) |
| `VITE_SENTRY_DSN` | Optional | Frontend Sentry |

**Rotation:** **[runbooks/token-and-key-rotation.md](runbooks/token-and-key-rotation.md)**

---

## Part 3: Firestore PITR & backups

Enable point-in-time recovery once per GCP project (billing required):

```bash
chmod +x scripts/enable-firestore-pitr.sh
./scripts/enable-firestore-pitr.sh YOUR_GCP_PROJECT_ID
```

Or: Firebase / GCP Console → Firestore → database → enable PITR.

Details: **[runbooks/firestore-pitr-and-backups.md](runbooks/firestore-pitr-and-backups.md)**

---

## Part 4: App Check (web)

1. Create reCAPTCHA **v3** site key; register app in Firebase **App Check**.
2. Add GitHub secret **`VITE_RECAPTCHA_SITE_KEY`** (same site key).
3. Deploy. When ready, enable **enforcement** for Cloud Functions in App Check console.

**runbooks/app-check-and-waf.md**

---

## Quick reference

```powershell
cd infra/terraform && terraform apply
# GitHub: all secrets from Part 1–2
./scripts/enable-firestore-pitr.sh peertutor-prod   # once
```

Push to `master` → CI → CD deploys S3, CloudFront, Firebase (functions, rules, **indexes**, storage).
