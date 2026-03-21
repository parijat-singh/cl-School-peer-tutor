# PeerTutor — Lambda functions (Phase 2: replaces Firebase Cloud Functions)

# ── S3 bucket for Lambda deployment packages ─────────────────────────────────
resource "aws_s3_bucket" "lambda_artifacts" {
  bucket = "${local.name_prefix}-lambda-artifacts-${data.aws_caller_identity.current.account_id}"
  tags   = merge(var.tags, { Name = "${local.name_prefix}-lambda-artifacts" })
}

resource "aws_s3_bucket_public_access_block" "lambda_artifacts" {
  bucket = aws_s3_bucket.lambda_artifacts.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── IAM execution role for all Lambda functions ──────────────────────────────
resource "aws_iam_role" "lambda_exec" {
  name = "${local.name_prefix}-lambda-exec"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = merge(var.tags, { Name = "${local.name_prefix}-lambda-exec" })
}

# CloudWatch Logs
resource "aws_iam_role_policy_attachment" "lambda_logs" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# DynamoDB access (all tables)
resource "aws_iam_role_policy" "lambda_dynamodb" {
  name = "${local.name_prefix}-lambda-dynamodb"
  role = aws_iam_role.lambda_exec.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "DynamoDBAccess"
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:BatchGetItem",
        "dynamodb:BatchWriteItem",
        "dynamodb:TransactGetItems",
        "dynamodb:TransactWriteItems",
      ]
      Resource = [
        for table in [
          aws_dynamodb_table.users,
          aws_dynamodb_table.availability_slots,
          aws_dynamodb_table.sessions,
          aws_dynamodb_table.booking_requests,
          aws_dynamodb_table.reviews,
          aws_dynamodb_table.schools,
          aws_dynamodb_table.stats,
          aws_dynamodb_table.email_verifications,
          aws_dynamodb_table.rate_limits,
          aws_dynamodb_table.admin_audit_log,
          aws_dynamodb_table.contact_submissions,
        ] : "${table.arn}*" # * covers table + all GSIs
      ]
    }]
  })
}

# S3 access (logos bucket — presigned URLs + read)
resource "aws_iam_role_policy" "lambda_s3_logos" {
  name = "${local.name_prefix}-lambda-s3-logos"
  role = aws_iam_role.lambda_exec.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "S3LogoAccess"
      Effect = "Allow"
      Action = [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
      ]
      Resource = "${aws_s3_bucket.logos.arn}/*"
    }]
  })
}

# Cognito admin operations (same permissions as cognito-backend IAM user)
resource "aws_iam_role_policy" "lambda_cognito" {
  name = "${local.name_prefix}-lambda-cognito"
  role = aws_iam_role.lambda_exec.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "CognitoAdminOps"
      Effect = "Allow"
      Action = [
        "cognito-idp:AdminGetUser",
        "cognito-idp:AdminUpdateUserAttributes",
        "cognito-idp:AdminDisableUser",
        "cognito-idp:AdminEnableUser",
        "cognito-idp:AdminSetUserPassword",
      ]
      Resource = aws_cognito_user_pool.main.arn
    }]
  })
}

# ── Shared Lambda environment variables ──────────────────────────────────────
locals {
  lambda_runtime = "nodejs22.x"
  lambda_timeout = 30
  lambda_memory  = 256

  lambda_env = {
    NODE_OPTIONS              = "--enable-source-maps"
    USERS_TABLE               = aws_dynamodb_table.users.name
    AVAILABILITY_TABLE        = aws_dynamodb_table.availability_slots.name
    SESSIONS_TABLE            = aws_dynamodb_table.sessions.name
    BOOKING_REQUESTS_TABLE    = aws_dynamodb_table.booking_requests.name
    REVIEWS_TABLE             = aws_dynamodb_table.reviews.name
    SCHOOLS_TABLE             = aws_dynamodb_table.schools.name
    STATS_TABLE               = aws_dynamodb_table.stats.name
    EMAIL_VERIFICATIONS_TABLE = aws_dynamodb_table.email_verifications.name
    RATE_LIMITS_TABLE         = aws_dynamodb_table.rate_limits.name
    ADMIN_AUDIT_LOG_TABLE     = aws_dynamodb_table.admin_audit_log.name
    CONTACT_SUBMISSIONS_TABLE = aws_dynamodb_table.contact_submissions.name
    LOGOS_BUCKET              = aws_s3_bucket.logos.id
    LOGOS_BASE_URL            = "https://${aws_cloudfront_distribution.frontend.domain_name}/logos"
    COGNITO_USER_POOL_ID      = aws_cognito_user_pool.main.id
    COGNITO_APP_CLIENT_ID     = aws_cognito_user_pool_client.spa.id
    AWS_ACCOUNT_REGION        = var.aws_region
    # Secrets injected via CD pipeline as Terraform variables
    SENTRY_DSN                = var.lambda_sentry_dsn
    SMTP_HOST                 = var.lambda_smtp_host
    SMTP_PORT                 = var.lambda_smtp_port
    SMTP_USER                 = var.lambda_smtp_user
    SMTP_PASS                 = var.lambda_smtp_pass
    SMTP_FROM_EMAIL           = var.lambda_smtp_from_email
    SMTP_FROM_NAME            = var.lambda_smtp_from_name
    SUPER_ADMIN_EMAIL         = var.lambda_super_admin_email
    GOOGLE_CALENDAR_CLIENT_EMAIL = var.lambda_google_calendar_client_email
    GOOGLE_CALENDAR_PRIVATE_KEY  = var.lambda_google_calendar_private_key
    GOOGLE_CALENDAR_ID           = var.lambda_google_calendar_id
    ANTHROPIC_API_KEY            = var.lambda_anthropic_api_key
  }
}

# ── Lambda functions ─────────────────────────────────────────────────────────
# Initial deployment uses a placeholder zip; CD pipeline updates with real code.

resource "aws_lambda_function" "auth" {
  function_name = "${local.name_prefix}-auth"
  role          = aws_iam_role.lambda_exec.arn
  runtime       = local.lambda_runtime
  handler       = "index.handler"
  timeout       = local.lambda_timeout
  memory_size   = local.lambda_memory

  s3_bucket = aws_s3_bucket.lambda_artifacts.id
  s3_key    = "auth/function.zip"

  environment { variables = local.lambda_env }
  tags = merge(var.tags, { Name = "${local.name_prefix}-auth" })

  lifecycle { ignore_changes = [s3_key, s3_object_version] }
}

resource "aws_lambda_function" "bookings" {
  function_name = "${local.name_prefix}-bookings"
  role          = aws_iam_role.lambda_exec.arn
  runtime       = local.lambda_runtime
  handler       = "index.handler"
  timeout       = local.lambda_timeout
  memory_size   = local.lambda_memory

  s3_bucket = aws_s3_bucket.lambda_artifacts.id
  s3_key    = "bookings/function.zip"

  environment { variables = local.lambda_env }
  tags = merge(var.tags, { Name = "${local.name_prefix}-bookings" })

  lifecycle { ignore_changes = [s3_key, s3_object_version] }
}

resource "aws_lambda_function" "schools" {
  function_name = "${local.name_prefix}-schools"
  role          = aws_iam_role.lambda_exec.arn
  runtime       = local.lambda_runtime
  handler       = "index.handler"
  timeout       = local.lambda_timeout
  memory_size   = local.lambda_memory

  s3_bucket = aws_s3_bucket.lambda_artifacts.id
  s3_key    = "schools/function.zip"

  environment { variables = local.lambda_env }
  tags = merge(var.tags, { Name = "${local.name_prefix}-schools" })

  lifecycle { ignore_changes = [s3_key, s3_object_version] }
}

resource "aws_lambda_function" "reviews" {
  function_name = "${local.name_prefix}-reviews"
  role          = aws_iam_role.lambda_exec.arn
  runtime       = local.lambda_runtime
  handler       = "index.handler"
  timeout       = local.lambda_timeout
  memory_size   = local.lambda_memory

  s3_bucket = aws_s3_bucket.lambda_artifacts.id
  s3_key    = "reviews/function.zip"

  environment { variables = local.lambda_env }
  tags = merge(var.tags, { Name = "${local.name_prefix}-reviews" })

  lifecycle { ignore_changes = [s3_key, s3_object_version] }
}

resource "aws_lambda_function" "misc" {
  function_name = "${local.name_prefix}-misc"
  role          = aws_iam_role.lambda_exec.arn
  runtime       = local.lambda_runtime
  handler       = "index.handler"
  timeout       = 60 # longer for AI recommendation calls
  memory_size   = local.lambda_memory

  s3_bucket = aws_s3_bucket.lambda_artifacts.id
  s3_key    = "misc/function.zip"

  environment { variables = local.lambda_env }
  tags = merge(var.tags, { Name = "${local.name_prefix}-misc" })

  lifecycle { ignore_changes = [s3_key, s3_object_version] }
}

resource "aws_lambda_function" "scheduled" {
  function_name = "${local.name_prefix}-scheduled"
  role          = aws_iam_role.lambda_exec.arn
  runtime       = local.lambda_runtime
  handler       = "index.handler"
  timeout       = 300 # scheduled tasks may process many items
  memory_size   = 512

  s3_bucket = aws_s3_bucket.lambda_artifacts.id
  s3_key    = "scheduled/function.zip"

  environment { variables = local.lambda_env }
  tags = merge(var.tags, { Name = "${local.name_prefix}-scheduled" })

  lifecycle { ignore_changes = [s3_key, s3_object_version] }
}
