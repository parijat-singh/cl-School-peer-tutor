# PeerTutor — S3 bucket for school logo uploads (replaces Firebase Storage)

resource "aws_s3_bucket" "logos" {
  bucket = "${local.name_prefix}-logos-${data.aws_caller_identity.current.account_id}"
  tags   = merge(var.tags, { Name = "${local.name_prefix}-logos" })
}

resource "aws_s3_bucket_public_access_block" "logos" {
  bucket = aws_s3_bucket.logos.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "logos" {
  bucket = aws_s3_bucket.logos.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT"]
    allowed_origins = var.domain_name != "" ? [
      "https://${var.domain_name}",
      "https://www.${var.domain_name}",
    ] : ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "logos" {
  bucket = aws_s3_bucket.logos.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Allow CloudFront to serve logos (reuse frontend OAC pattern)
resource "aws_cloudfront_origin_access_control" "logos" {
  name                              = "${local.name_prefix}-logos-oac"
  description                       = "OAC for logo bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_s3_bucket_policy" "logos" {
  bucket = aws_s3_bucket.logos.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontRead"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.logos.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
          }
        }
      }
    ]
  })
}
