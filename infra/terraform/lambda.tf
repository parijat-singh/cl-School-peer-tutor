# PeerTutor — Lambda functions for API backend
# Six handler groups deployed from S3 zips built in CI.

# Uses the frontend S3 bucket (or a custom one) for Lambda deployment zips.

locals {
  lambda_deploy_bucket = var.lambda_deploy_bucket != "" ? var.lambda_deploy_bucket : aws_s3_bucket.frontend.id
  lambda_groups        = toset(["auth", "bookings", "schools", "reviews", "misc", "scheduled"])

  lambda_environment = {
    NODE_OPTIONS = "--enable-source-maps"

    # DynamoDB table names
    DYNAMODB_TABLE_USERS               = aws_dynamodb_table.tables["users"].name
    DYNAMODB_TABLE_AVAILABILITY_SLOTS  = aws_dynamodb_table.tables["availability-slots"].name
    DYNAMODB_TABLE_SESSIONS            = aws_dynamodb_table.tables["sessions"].name
    DYNAMODB_TABLE_BOOKING_REQUESTS    = aws_dynamodb_table.tables["booking-requests"].name
    DYNAMODB_TABLE_REVIEWS             = aws_dynamodb_table.tables["reviews"].name
    DYNAMODB_TABLE_SCHOOLS             = aws_dynamodb_table.tables["schools"].name
    DYNAMODB_TABLE_STATS               = aws_dynamodb_table.tables["stats"].name
    DYNAMODB_TABLE_EMAIL_VERIFICATIONS = aws_dynamodb_table.tables["email-verifications"].name
    DYNAMODB_TABLE_RATE_LIMITS         = aws_dynamodb_table.tables["rate-limits"].name
    DYNAMODB_TABLE_ADMIN_AUDIT_LOG     = aws_dynamodb_table.tables["admin-audit-log"].name
    DYNAMODB_TABLE_CONTACT_SUBMISSIONS = aws_dynamodb_table.tables["contact-submissions"].name

    # Cognito
    COGNITO_USER_POOL_ID  = aws_cognito_user_pool.main.id
    COGNITO_APP_CLIENT_ID = aws_cognito_user_pool_client.spa.id
    AWS_REGION_NAME       = var.aws_region

    # External services
    SENTRY_DSN        = var.sentry_dsn
    SUPER_ADMIN_EMAIL = var.super_admin_email
    ANTHROPIC_API_KEY = var.anthropic_api_key

    # SMTP
    SMTP_HOST       = var.smtp_host
    SMTP_PORT       = var.smtp_port
    SMTP_USER       = var.smtp_user
    SMTP_PASS       = var.smtp_pass
    SMTP_FROM_EMAIL = var.smtp_from_email
    SMTP_FROM_NAME  = var.smtp_from_name

    # Google Calendar
    GOOGLE_CALENDAR_CLIENT_EMAIL = var.google_calendar_client_email
    GOOGLE_CALENDAR_PRIVATE_KEY  = var.google_calendar_private_key
    GOOGLE_CALENDAR_ID           = var.google_calendar_id

    # Logos bucket
    LOGOS_BUCKET_NAME = aws_s3_bucket.logos.id
  }
}

# ── Shared IAM execution role ────────────────────────────────────────────────

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

resource "aws_iam_role_policy" "lambda_policy" {
  name = "${local.name_prefix}-lambda-policy"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:*"
      },
      {
        Sid    = "DynamoDBReadWrite"
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
        Resource = concat(
          [for t in aws_dynamodb_table.tables : t.arn],
          [for t in aws_dynamodb_table.tables : "${t.arn}/index/*"],
        )
      },
      {
        Sid    = "CognitoAdminOps"
        Effect = "Allow"
        Action = [
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminUpdateUserAttributes",
          "cognito-idp:AdminDisableUser",
          "cognito-idp:AdminEnableUser",
          "cognito-idp:AdminSetUserPassword",
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminDeleteUser",
          "cognito-idp:ListUsers",
        ]
        Resource = aws_cognito_user_pool.main.arn
      },
      {
        Sid    = "SESSendEmail"
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail",
        ]
        Resource = "*"
      },
      {
        Sid    = "S3LogosBucket"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket",
        ]
        Resource = [
          aws_s3_bucket.logos.arn,
          "${aws_s3_bucket.logos.arn}/*",
        ]
      },
    ]
  })
}

# ── Lambda functions (one per handler group) ─────────────────────────────────

resource "aws_lambda_function" "handlers" {
  for_each = local.lambda_groups

  function_name = "${local.name_prefix}-${each.key}"
  description   = "PeerTutor ${each.key} handler"
  role          = aws_iam_role.lambda_exec.arn
  runtime       = "nodejs22.x"
  handler       = "index.handler"
  architectures = ["arm64"]
  memory_size   = each.key == "scheduled" ? 128 : 256
  timeout       = each.key == "scheduled" ? 300 : 30

  # Initial deploy uses local zip files; CD pipeline updates via S3 afterward.
  filename         = "${path.module}/../../backend/lambdas/dist/${each.key}.zip"
  source_code_hash = filebase64sha256("${path.module}/../../backend/lambdas/dist/${each.key}.zip")

  environment {
    variables = local.lambda_environment
  }

  tags = merge(var.tags, { Name = "${local.name_prefix}-${each.key}" })

  depends_on = [
    aws_cloudwatch_log_group.lambda_logs,
  ]

  lifecycle { ignore_changes = [filename, source_code_hash, s3_bucket, s3_key, s3_object_version] }
}

# ── CloudWatch Log Groups ────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "lambda_logs" {
  for_each = local.lambda_groups

  name              = "/aws/lambda/${local.name_prefix}-${each.key}"
  retention_in_days = 30

  tags = merge(var.tags, { Name = "${local.name_prefix}-${each.key}-logs" })
}

# ── API Gateway invoke permission (all groups except scheduled) ──────────────

resource "aws_lambda_permission" "apigw" {
  for_each = setsubtract(local.lambda_groups, toset(["scheduled"]))

  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.handlers[each.key].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}
