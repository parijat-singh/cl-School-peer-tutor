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
  description = "Set to true to attach domain_name and acm_certificate_arn to CloudFront"
  type        = bool
  default     = false
}

variable "tags" {
  description = "Tags applied to all resources"
  type        = map(string)
  default     = {}
}
