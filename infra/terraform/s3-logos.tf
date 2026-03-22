# PeerTutor — S3 bucket for school logos (publicly readable)

resource "aws_s3_bucket" "logos" {
  bucket = "${local.name_prefix}-logos-${data.aws_caller_identity.current.account_id}"

  tags = merge(var.tags, { Name = "${local.name_prefix}-logos" })
}

# ── Public access settings (logos are publicly readable) ─────────────────────

resource "aws_s3_bucket_public_access_block" "logos" {
  bucket = aws_s3_bucket.logos.id

  block_public_acls       = true
  block_public_policy     = false
  ignore_public_acls      = true
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "logos" {
  bucket = aws_s3_bucket.logos.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.logos.arn}/*"
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.logos]
}

# ── CORS (allow GET from any origin) ────────────────────────────────────────

resource "aws_s3_bucket_cors_configuration" "logos" {
  bucket = aws_s3_bucket.logos.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET"]
    allowed_origins = ["*"]
    max_age_seconds = 86400
  }
}

# ── Encryption ──────────────────────────────────────────────────────────────

resource "aws_s3_bucket_server_side_encryption_configuration" "logos" {
  bucket = aws_s3_bucket.logos.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
