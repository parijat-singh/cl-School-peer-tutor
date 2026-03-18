# PeerTutor — Production setup guide

Step-by-step instructions to provision AWS (Terraform), create the IAM access key, add GitHub Secrets, and set Firebase function secrets.

---

## Part 1: AWS (Terraform + IAM + GitHub Secrets)

### 1.1 Prerequisites

- **AWS account** with permissions to create S3, CloudFront, and IAM resources.
- **AWS CLI** installed and configured with an identity that has admin (or sufficient) access:
  ```bash
  aws configure
  # Enter Access Key ID, Secret Access Key, region (e.g. us-east-1)
  ```
- **Terraform** installed ([terraform.io/downloads](https://www.terraform.io/downloads)), e.g.:
  ```bash
  # Windows (PowerShell)
  winget install Hashicorp.Terraform
  # Or: choco install terraform
  ```

### 1.2 Run Terraform

Open a terminal in the repo root.

```powershell
cd infra/terraform
```

Initialize Terraform (downloads the AWS provider):

```powershell
terraform init
```

Review what will be created:

```powershell
terraform plan
```

You should see: S3 bucket, CloudFront OAC, CloudFront distribution, S3 bucket policy, IAM user, IAM user policy. Apply the changes:

```powershell
terraform apply
```

When prompted **"Enter a value:"**, press Enter to accept defaults (or type `yes` for the final apply confirmation). Wait for **Apply complete**.

### 1.3 Note the Terraform outputs

Run:

```powershell
terraform output
```

You will see something like:

```
cloudfront_distribution_id = "E1234ABCD5678"
cloudfront_domain_name    = "abc123xyz.cloudfront.net"
cloudfront_url            = "https://abc123xyz.cloudfront.net"
github_deploy_iam_user_arn = "arn:aws:iam::123456789012:user/peertutor-github-deploy"
github_deploy_iam_user_name = "peertutor-github-deploy"
s3_bucket_name            = "peertutor-frontend-123456789012"
```

**Keep this window open** or copy these values; you will need them for GitHub Secrets.

### 1.4 Create IAM access key for the deploy user

The Terraform user `peertutor-github-deploy` has no keys yet. Create one access key for GitHub Actions.

**Option A — Using Terraform output (recommended):**

```powershell
aws iam create-access-key --user-name $(terraform output -raw github_deploy_iam_user_name)
```

**Option B — Using the user name directly:**

```powershell
aws iam create-access-key --user-name peertutor-github-deploy
```

The command returns JSON. Example:

```json
{
    "AccessKey": {
        "AccessKeyId": "AKIA...",
        "SecretAccessKey": "wJalr...",
        "Status": "Active",
        "UserName": "peertutor-github-deploy"
    }
}
```

- Copy **AccessKeyId** → you will add it as GitHub Secret `AWS_ACCESS_KEY_ID`.
- Copy **SecretAccessKey** → you will add it as GitHub Secret `AWS_SECRET_ACCESS_KEY`.  
  You will not be able to see the secret again, so store it somewhere safe (e.g. a password manager) until it’s in GitHub.

### 1.5 Add GitHub Secrets (AWS + Terraform outputs)

1. Open your repo on GitHub.
2. Go to **Settings** → **Secrets and variables** → **Actions**.
3. Click **New repository secret** and add each of the following.

| Secret name | Where to get the value |
|-------------|------------------------|
| `AWS_ACCESS_KEY_ID` | From the `create-access-key` output: **AccessKeyId** |
| `AWS_SECRET_ACCESS_KEY` | From the `create-access-key` output: **SecretAccessKey** |
| `AWS_REGION` | The region you used for Terraform, e.g. `us-east-1` |
| `S3_BUCKET` | `terraform output -raw s3_bucket_name` (e.g. `peertutor-frontend-123456789012`) |
| `CLOUDFRONT_DISTRIBUTION_ID` | `terraform output -raw cloudfront_distribution_id` (e.g. `E1234ABCD5678`) |

After this, the CD workflow can deploy the frontend to S3 and invalidate CloudFront.

### 1.6 Optional: test the frontend URL

Before a custom domain is set, the app is available at the CloudFront URL:

```
https://<cloudfront_domain_name>
```

Example: `https://abc123xyz.cloudfront.net`. You can open it after the first successful deploy.

---

## Part 2: Firebase function secrets (Sentry and others)

Function secrets are stored in **Google Cloud Secret Manager** and are available to Cloud Functions at runtime. You set them once per Firebase project via the Firebase CLI.

### 2.1 Prerequisites

- **Firebase CLI** installed and logged in:
  ```powershell
  npm install -g firebase-tools
  firebase login
  ```
- **Project selected** (use your production project):
  ```powershell
  cd backend
  firebase use peertutor-prod
  ```
  Replace `peertutor-prod` with your project ID if different.

### 2.2 Required: SENTRY_DSN

Sentry is used for error tracking in Cloud Functions. The code expects the secret name **SENTRY_DSN**.

1. In [Sentry](https://sentry.io), open your project (or create one for Node/Cloud Functions).
2. Go to **Settings** → **Projects** → **[Your project]** → **Client Keys (DSN)**.
3. Copy the **DSN** (looks like `https://xxx@xxx.ingest.sentry.io/xxx`).

Then run:

```powershell
cd backend
firebase functions:secrets:set SENTRY_DSN
```

When prompted **"Enter a value for SENTRY_DSN"**, paste the DSN and press Enter. The value is stored in Secret Manager and will be available as `process.env.SENTRY_DSN` in your functions.

To confirm (value is masked):

```powershell
firebase functions:secrets:access SENTRY_DSN
```

### 2.3 Optional: other function secrets

Your functions also read these from `process.env`. They are **not** yet declared as secrets in code; they are typically provided by:

- **Local/dev:** `.env` (from `.env.example`).
- **Production:** Either set them as **Firebase secrets** (and add them to `setGlobalOptions` in code) or as **environment variables** in Google Cloud Console (Cloud Functions → your function → Configuration → Environment variables).

If you want to use **Secret Manager** for production, you can set them the same way as SENTRY_DSN. The code would need to be updated to declare them in `setGlobalOptions({ secrets: ["SENTRY_DSN", "SMTP_PASS", ...] })`; until then, use **Google Cloud Console** to set environment variables for your functions.

Common variables your code uses:

| Variable | Used by | Notes |
|----------|--------|--------|
| `SENTRY_DSN` | All functions (Sentry) | **Required** — set via `firebase functions:secrets:set SENTRY_DSN` (already in code). |
| `SMTP_PASS` | Email (e.g. Resend) | Set in Secret Manager or Cloud Console env. |
| `SMTP_USER` | Email | Set in Cloud Console env if needed. |
| `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME` | Email | Set in Cloud Console env. |
| `SUPER_ADMIN_EMAIL` | Contact form, school registration | Set in Secret Manager or Cloud Console env. |
| `GOOGLE_CALENDAR_CLIENT_EMAIL` | Google Meet | Set in Secret Manager or Cloud Console env. |
| `GOOGLE_CALENDAR_PRIVATE_KEY` | Google Meet | Set in Secret Manager or Cloud Console env (multi-line). |
| `ANTHROPIC_API_KEY` | Recommendations | Set in Secret Manager or Cloud Console env. |

**Setting a secret via CLI (same pattern as SENTRY_DSN):**

```powershell
firebase functions:secrets:set SUPER_ADMIN_EMAIL
# Enter the email when prompted.
```

**Setting env vars in Google Cloud Console:**

1. Open [Google Cloud Console](https://console.cloud.google.com) → your project.
2. **Cloud Functions** → select a function (e.g. `submitContactForm`) → **Edit** → **Runtime, build, connections and security**.
3. Under **Runtime environment variables**, add the variable name and value.
4. Save and redeploy if needed.

For production, prefer **secrets** for sensitive values (passwords, API keys, private keys) and use the CLI as above; add those secret names to `setGlobalOptions` in `backend/functions/src/index.ts` so they are injected at runtime.

### 2.4 Verify

After setting SENTRY_DSN (and any others), deploy functions so they pick up the secrets:

```powershell
cd backend
firebase deploy --only functions --project peertutor-prod
```

Then trigger an action that runs a function (e.g. submit contact form or book a session). In Sentry you should see the project and, if an error occurs, events from the function.

---

## Quick reference

**AWS (one-time):**

```powershell
cd infra/terraform
terraform init
terraform apply
terraform output
aws iam create-access-key --user-name peertutor-github-deploy
# Add AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET, CLOUDFRONT_DISTRIBUTION_ID to GitHub Secrets
```

**Firebase (once per project):**

```powershell
cd backend
firebase use peertutor-prod
firebase functions:secrets:set SENTRY_DSN
# Paste Sentry DSN when prompted
# Optionally: set other secrets (SMTP_PASS, SUPER_ADMIN_EMAIL, etc.)
```

After both parts are done, the next successful run of the CD workflow will deploy the frontend to S3/CloudFront, and your functions will have Sentry (and any other secrets you set) available in production.
