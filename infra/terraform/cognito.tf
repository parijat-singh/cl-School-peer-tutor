# PeerTutor — AWS Cognito User Pool for authentication
# Replaces Firebase Auth (Phase 1 of AWS migration)

# ── User Pool ─────────────────────────────────────────────────────────────────
resource "aws_cognito_user_pool" "main" {
  name = "${local.name_prefix}-users"

  # Email as username
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # Prevent user enumeration
  username_configuration {
    case_sensitive = false
  }

  # Password policy matching existing frontend validation
  password_policy {
    minimum_length                   = 8
    require_uppercase                = true
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 7
  }

  # Email verification with 6-digit code (replaces custom OTP flow)
  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "PeerTutor — Verify your email"
    email_message        = "Your PeerTutor verification code is {####}"
  }

  # Custom attributes mapping to Firebase custom claims
  schema {
    name                = "role"
    attribute_data_type = "String"
    mutable             = true

    string_attribute_constraints {
      min_length = 1
      max_length = 32
    }
  }

  schema {
    name                = "schoolDomain"
    attribute_data_type = "String"
    mutable             = true

    string_attribute_constraints {
      min_length = 0
      max_length = 256
    }
  }

  schema {
    name                = "status"
    attribute_data_type = "String"
    mutable             = true

    string_attribute_constraints {
      min_length = 1
      max_length = 32
    }
  }

  # Account recovery via verified email
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Use SES for email if ARN provided, otherwise Cognito default
  dynamic "email_configuration" {
    for_each = var.cognito_ses_email_arn != "" ? [1] : []
    content {
      email_sending_account  = "DEVELOPER"
      source_arn             = var.cognito_ses_email_arn
      from_email_address     = var.cognito_from_email
      reply_to_email_address = var.cognito_from_email
    }
  }

  dynamic "email_configuration" {
    for_each = var.cognito_ses_email_arn != "" ? [] : [1]
    content {
      email_sending_account = "COGNITO_DEFAULT"
    }
  }

  tags = merge(var.tags, { Name = "${local.name_prefix}-users" })
}

# ── App Client (public SPA — no secret) ──────────────────────────────────────
resource "aws_cognito_user_pool_client" "spa" {
  name         = "${local.name_prefix}-spa"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
  ]

  # Token validity
  access_token_validity  = 1  # hours
  id_token_validity      = 1  # hours
  refresh_token_validity = 30 # days

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  # Prevent user existence errors (no user enumeration)
  prevent_user_existence_errors = "ENABLED"

  # Read/write custom attributes
  read_attributes = [
    "email",
    "email_verified",
    "custom:role",
    "custom:schoolDomain",
    "custom:status",
  ]

  write_attributes = [
    "email",
    "custom:role",
    "custom:schoolDomain",
    "custom:status",
  ]
}

# ── IAM user for backend Cognito admin operations ────────────────────────────
resource "aws_iam_user" "cognito_backend" {
  name = "${local.name_prefix}-cognito-backend"
  path = "/"
  tags = merge(var.tags, { Name = "${local.name_prefix}-cognito-backend" })
}

resource "aws_iam_user_policy" "cognito_backend" {
  name = "${local.name_prefix}-cognito-admin-ops"
  user = aws_iam_user.cognito_backend.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
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
      }
    ]
  })
}
