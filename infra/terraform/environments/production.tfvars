# Production environment — matches current deployed infrastructure
# Sensitive variables (smtp_*, anthropic_api_key, super_admin_email, etc.)
# must be passed via -var flags or TF_VAR_ environment variables.

environment          = "production"
project_name         = "peertutor"
aws_region           = "us-east-1"
domain_name          = "schoolpeertutor.com"
enable_custom_domain = true
create_acm_certificate = true
enable_waf           = false
enable_s3_versioning = true
s3_version_lifecycle_days = 30
