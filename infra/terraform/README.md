# PeerTutor — AWS infrastructure (Terraform)

Minimal IaC for production frontend: **S3 bucket** (private) + **CloudFront** (OAC, SPA support) + **IAM user** for GitHub Actions deploy.

## Prerequisites

- [Terraform](https://www.terraform.io/downloads) >= 1.0
- AWS CLI configured (e.g. `aws configure` with an admin or power-user account)

## Quick start

```bash
cd infra/terraform
terraform init
terraform plan   # review
terraform apply  # type yes when prompted
```

After apply, note the outputs:

- `s3_bucket_name` → GitHub Secret `S3_BUCKET`
- `cloudfront_distribution_id` → GitHub Secret `CLOUDFRONT_DISTRIBUTION_ID`
- `cloudfront_url` → use this until you attach a custom domain

## Create access key for GitHub Actions

```bash
aws iam create-access-key --user-name $(terraform output -raw github_deploy_iam_user_name)
```

Add to GitHub → Settings → Secrets and variables → Actions:

| Secret                 | Value                    |
|------------------------|--------------------------|
| `AWS_ACCESS_KEY_ID`    | AccessKeyId from output  |
| `AWS_SECRET_ACCESS_KEY`| SecretAccessKey from output |
| `AWS_REGION`           | e.g. `us-east-1`         |
| `S3_BUCKET`            | `terraform output -raw s3_bucket_name` |
| `CLOUDFRONT_DISTRIBUTION_ID` | `terraform output -raw cloudfront_distribution_id` |

## Custom domain (optional)

1. Create an ACM certificate in **us-east-1** for your domain (e.g. `schoolpeertutor.com`).
2. Set variables and re-apply:

```hcl
# terraform.tfvars (do not commit if it contains sensitive data)
project_name        = "peertutor"
domain_name         = "schoolpeertutor.com"
acm_certificate_arn = "arn:aws:acm:us-east-1:ACCOUNT:certificate/CERT_ID"
enable_custom_domain = true
```

3. Point your DNS to the CloudFront domain (or create a CNAME alias in Route 53).

## What this creates

| Resource | Purpose |
|----------|---------|
| S3 bucket | Holds frontend static files; **block public access** enabled |
| CloudFront OAC | Only CloudFront can read from S3; bucket is not public |
| S3 bucket policy | Allows CloudFront service principal only |
| CloudFront distribution | Default and `/index.html` → no-cache; `/*` → 1-year cache; 403/404 → 200 with `/index.html` (SPA) |
| IAM user `peertutor-github-deploy` | Policy: S3 Put/Delete/Get/List on bucket, CloudFront CreateInvalidation |

## One-page cheat sheet (after apply)

```bash
# 1. Get outputs
terraform output

# 2. Create access key (run once; save the SecretAccessKey — it’s shown only once)
aws iam create-access-key --user-name $(terraform output -raw github_deploy_iam_user_name)

# 3. Add these as GitHub repo Secrets (Settings → Secrets and variables → Actions)
#    AWS_ACCESS_KEY_ID      = AccessKeyId from step 2
#    AWS_SECRET_ACCESS_KEY  = SecretAccessKey from step 2
#    AWS_REGION             = e.g. us-east-1
#    S3_BUCKET              = terraform output -raw s3_bucket_name
#    CLOUDFRONT_DISTRIBUTION_ID = terraform output -raw cloudfront_distribution_id
```

Full walkthrough: **[../docs/production-setup-guide.md](../docs/production-setup-guide.md)**.

## Troubleshooting

### `waiting for S3 Bucket create: empty result`

Common in **us-east-1**. This repo sets `s3_us_east_1_regional_endpoint = "regional"` on the provider to avoid it. Pull latest `main.tf`, then:

```powershell
terraform apply
```

Also ensure the provisioner IAM user can **`s3:HeadBucket`** on the bucket (add to inline policy if needed).

If the bucket **already exists** in AWS (failed apply left it behind):

```powershell
aws s3 ls | findstr peertutor-frontend
```

Either **delete** the bucket in S3 console (empty it first), or **import**:

```powershell
terraform import aws_s3_bucket.frontend peertutor-frontend-YOUR_ACCOUNT_ID
```

## Destroy

```bash
terraform destroy
```

Empty the S3 bucket first if Terraform reports it is not empty.
