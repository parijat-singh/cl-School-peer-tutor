# PeerTutor — AWS infrastructure variables

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

variable "tags" {
  description = "Tags applied to all resources"
  type        = map(string)
  default     = {}
}
