# Staging environment — deployed at test.schoolpeertutor.com
# Creates all resources with "peertutor-staging-" prefix.
# Sensitive variables (smtp_*, anthropic_api_key, super_admin_email, etc.)
# must be passed via -var flags or TF_VAR_ environment variables.
#
# Phase 1: Deploy without custom domain (uses CloudFront default URL)
# Phase 2: Set enable_custom_domain=true, create_acm_certificate=true,
#           add DNS validation CNAMEs, re-apply to attach test.schoolpeertutor.com

environment            = "staging"
project_name           = "peertutor"
aws_region             = "us-east-1"
domain_name            = "test.schoolpeertutor.com"
enable_custom_domain   = false
create_acm_certificate = false
enable_waf             = false
enable_s3_versioning   = false
