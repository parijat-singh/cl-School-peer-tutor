# Staging environment — deployed at test.schoolpeertutor.com
# Creates all resources with "peertutor-staging-" prefix.
# Sensitive variables (smtp_*, anthropic_api_key, super_admin_email, etc.)
# must be passed via -var flags or TF_VAR_ environment variables.

environment          = "staging"
project_name         = "peertutor"
aws_region           = "us-east-1"
domain_name          = "test.schoolpeertutor.com"
enable_custom_domain = true
create_acm_certificate = true
enable_waf           = false
enable_s3_versioning = false
