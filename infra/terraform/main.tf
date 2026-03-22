# PeerTutor — Minimal AWS IaC: S3 + CloudFront (OAC) + IAM for GitHub Actions
# Run: terraform init && terraform plan && terraform apply

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
  # Fixes intermittent "waiting for S3 Bucket create: empty result" in us-east-1
  # (legacy global endpoint vs regional HeadBucket during create wait).
  s3_us_east_1_regional_endpoint = "regional"
}

data "aws_caller_identity" "current" {}

locals {
  name_prefix  = var.environment == "production" ? var.project_name : "${var.project_name}-${var.environment}"
  bucket_name  = "${local.name_prefix}-frontend-${data.aws_caller_identity.current.account_id}"
  acm_arn_for_cloudfront = var.acm_certificate_arn != "" ? var.acm_certificate_arn : (
    length(aws_acm_certificate_validation.frontend) > 0 ? aws_acm_certificate_validation.frontend[0].certificate_arn : ""
  )
  use_tls_aliases = var.enable_custom_domain && var.domain_name != "" && local.acm_arn_for_cloudfront != ""
  cloudfront_aliases = local.use_tls_aliases ? [var.domain_name, "www.${var.domain_name}"] : []
}

# ── S3 bucket (private, no public access) ─────────────────────────────────────
resource "aws_s3_bucket" "frontend" {
  bucket = local.bucket_name
  tags   = merge(var.tags, { Name = local.bucket_name })

  timeouts {
    create = "10m"
    read   = "5m"
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  versioning_configuration {
    status = var.enable_s3_versioning ? "Enabled" : "Suspended"
  }
}

# Expire old versions to control cost (only when versioning enabled)
resource "aws_s3_bucket_lifecycle_configuration" "frontend" {
  count  = var.enable_s3_versioning && var.s3_version_lifecycle_days > 0 ? 1 : 0
  bucket = aws_s3_bucket.frontend.id

  rule {
    id     = "expire-noncurrent"
    status = "Enabled"
    filter {} # whole bucket
    noncurrent_version_expiration {
      noncurrent_days = var.s3_version_lifecycle_days
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# ── CloudFront OAC (Origin Access Control) ──────────────────────────────────
# Only CloudFront can read from S3; bucket is not public.
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${local.name_prefix}-frontend-oac"
  description                       = "OAC for ${local.bucket_name}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ── CloudFront distribution ─────────────────────────────────────────────────
resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "PeerTutor frontend - ${local.name_prefix}"
  default_root_object = "index.html"
  price_class         = "PriceClass_100" # US, Canada, Europe
  aliases             = local.cloudfront_aliases
  web_acl_id          = var.enable_waf ? aws_wafv2_web_acl.frontend[0].arn : null

  dynamic "viewer_certificate" {
    for_each = local.use_tls_aliases ? [1] : []
    content {
      acm_certificate_arn            = local.acm_arn_for_cloudfront
      ssl_support_method             = "sni-only"
      minimum_protocol_version       = "TLSv1.2_2021"
      cloudfront_default_certificate = false
    }
  }

  dynamic "viewer_certificate" {
    for_each = local.use_tls_aliases ? [] : [1]
    content {
      cloudfront_default_certificate = true
    }
  }

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                 = "S3-${aws_s3_bucket.frontend.id}"
    origin_access_control_id  = aws_cloudfront_origin_access_control.frontend.id
  }

  # Respect origin Cache-Control: index.html no-cache, hashed assets long cache
  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${aws_s3_bucket.frontend.id}"
    compress               = true
    viewer_protocol_policy = "redirect-to-https"

    cache_policy_id = aws_cloudfront_cache_policy.respect_origin.id
  }

  # SPA: 403/404 → 200 index.html so client-side routing works
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }
  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = merge(var.tags, { Name = "${local.name_prefix}-frontend" })
}

# Cache policy: respect origin Cache-Control (CD sets no-cache on index.html, long cache on hashed assets)
resource "aws_cloudfront_cache_policy" "respect_origin" {
  name        = "${local.name_prefix}-respect-origin"
  comment     = "Respect S3 object Cache-Control headers"
  default_ttl = 0
  max_ttl     = 31536000
  min_ttl     = 0
  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config { cookie_behavior = "none" }
    headers_config { header_behavior = "none" }
    query_strings_config { query_string_behavior = "none" }
    enable_accept_encoding_gzip   = true
    enable_accept_encoding_brotli = true
  }
}

# S3 bucket policy: allow only CloudFront (via OAC) to read
resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontServicePrincipal"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.frontend.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
          }
        }
      }
    ]
  })
}

# ── IAM user + policy for GitHub Actions (or CI) ─────────────────────────────
# Create this user, attach the policy, then add access key to GitHub Secrets.
resource "aws_iam_user" "github_deploy" {
  name = "${local.name_prefix}-github-deploy"
  path = "/"
  tags = merge(var.tags, { Name = "${local.name_prefix}-github-deploy" })
}

resource "aws_iam_user_policy" "github_deploy" {
  name   = "${local.name_prefix}-frontend-deploy"
  user   = aws_iam_user.github_deploy.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3Sync"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.frontend.arn,
          "${aws_s3_bucket.frontend.arn}/*"
        ]
      },
      {
        Sid    = "CloudFrontInvalidate"
        Effect = "Allow"
        Action = [
          "cloudfront:CreateInvalidation",
          "cloudfront:GetInvalidation"
        ]
        Resource = aws_cloudfront_distribution.frontend.arn
      },
      {
        Sid    = "LambdaDeploy"
        Effect = "Allow"
        Action = [
          "lambda:UpdateFunctionCode",
          "lambda:GetFunction"
        ]
        Resource = [for fn in aws_lambda_function.handlers : fn.arn]
      }
    ]
  })
}
