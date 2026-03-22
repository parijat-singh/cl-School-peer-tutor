# PeerTutor — AWS infrastructure variables

variable "environment" {
  description = "Environment name (production or staging)"
  type        = string
  default     = "production"
  validation {
    condition     = contains(["production", "staging"], var.environment)
    error_message = "Environment must be 'production' or 'staging'."
  }
}

variable "project_name" {
  description = "Project name used for resource naming (e.g. peertutor, schoolpeertutor)"
  type        = string
  default     = "peertutor"
}

variable "aws_region" {
  description = "AWS region for S3 and CloudFront"
  type        = string
  default     = "us-east-1"
}

variable "domain_name" {
  description = "Custom domain for the frontend (e.g. schoolpeertutor.com). Leave empty to use CloudFront URL only."
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ARN of ACM certificate for custom domain (must be in us-east-1). Set only if domain_name is set."
  type        = string
  default     = ""
}

variable "enable_custom_domain" {
  description = "Attach domain_name to CloudFront (requires issued ACM cert — see acm_certificate_arn or create_acm_certificate+route53)"
  type        = bool
  default     = false
}

variable "create_acm_certificate" {
  description = "Request ACM cert (us-east-1) for domain + www. Use with route53_zone_id for auto-validation, or add DNS records from terraform output then set acm_certificate_arn."
  type        = bool
  default     = false
}

variable "route53_zone_id" {
  description = "Hosted zone ID for DNS validation when create_acm_certificate=true (same account)"
  type        = string
  default     = ""
}

variable "enable_waf" {
  description = "Attach AWS WAF (managed common rule set) to CloudFront — extra cost, reduces abuse"
  type        = bool
  default     = false
}

variable "enable_s3_versioning" {
  description = "Enable S3 versioning for frontend bucket (rollback / recovery); set lifecycle_days to expire old versions"
  type        = bool
  default     = true
}

variable "s3_version_lifecycle_days" {
  description = "Expire noncurrent object versions after this many days (0 = keep forever; 30–90 typical)"
  type        = number
  default     = 30
}

variable "cognito_ses_email_arn" {
  description = "SES verified identity ARN for Cognito emails. Leave empty to use Cognito default email."
  type        = string
  default     = ""
}

variable "cognito_from_email" {
  description = "From email address for Cognito emails (only used when cognito_ses_email_arn is set)"
  type        = string
  default     = "noreply@schoolpeertutor.com"
}

variable "tags" {
  description = "Tags applied to all resources"
  type        = map(string)
  default     = {}
}

# ── Backend / Lambda variables ───────────────────────────────────────────────

variable "lambda_deploy_bucket" {
  description = "S3 bucket name that holds Lambda deployment zips (lambdas/{group}.zip). Leave empty to auto-create."
  type        = string
  default     = ""
}

variable "sentry_dsn" {
  description = "Sentry DSN for Lambda error reporting"
  type        = string
  default     = ""
}

variable "smtp_host" {
  description = "SMTP server host for outbound email"
  type        = string
  default     = ""
}

variable "smtp_port" {
  description = "SMTP server port"
  type        = string
  default     = ""
}

variable "smtp_user" {
  description = "SMTP username"
  type        = string
  default     = ""
  sensitive   = true
}

variable "smtp_pass" {
  description = "SMTP password"
  type        = string
  default     = ""
  sensitive   = true
}

variable "smtp_from_email" {
  description = "From email address for outbound emails"
  type        = string
  default     = ""
}

variable "smtp_from_name" {
  description = "From display name for outbound emails"
  type        = string
  default     = ""
}

variable "super_admin_email" {
  description = "Email address of the super admin user"
  type        = string
}

variable "google_calendar_client_email" {
  description = "Google Calendar service account email"
  type        = string
  default     = ""
}

variable "google_calendar_private_key" {
  description = "Google Calendar service account private key"
  type        = string
  default     = ""
  sensitive   = true
}

variable "google_calendar_id" {
  description = "Google Calendar ID for session events"
  type        = string
  default     = ""
}

variable "anthropic_api_key" {
  description = "Anthropic API key for AI-powered tutor recommendations"
  type        = string
  default     = ""
  sensitive   = true
}
