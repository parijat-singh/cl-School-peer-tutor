# PeerTutor — API Gateway v2 (HTTP API) with Cognito JWT authorizer

# ── HTTP API ─────────────────────────────────────────────────────────────────

resource "aws_apigatewayv2_api" "main" {
  name          = "${local.name_prefix}-api"
  protocol_type = "HTTP"
  description   = "PeerTutor backend HTTP API"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization", "X-Amz-Date", "X-Api-Key"]
    max_age       = 86400
  }

  tags = merge(var.tags, { Name = "${local.name_prefix}-api" })
}

# ── Cognito JWT Authorizer ───────────────────────────────────────────────────

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.main.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "cognito-jwt"

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.spa.id]
    issuer   = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
  }
}

# ── Stage ($default with auto-deploy and access logging) ────────────────────

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.apigw_access_logs.arn
    format = jsonencode({
      requestId        = "$context.requestId"
      ip               = "$context.identity.sourceIp"
      requestTime      = "$context.requestTime"
      httpMethod       = "$context.httpMethod"
      routeKey         = "$context.routeKey"
      status           = "$context.status"
      protocol         = "$context.protocol"
      responseLength   = "$context.responseLength"
      integrationError = "$context.integrationErrorMessage"
    })
  }

  tags = merge(var.tags, { Name = "${local.name_prefix}-api-default-stage" })
}

resource "aws_cloudwatch_log_group" "apigw_access_logs" {
  name              = "/aws/apigateway/${local.name_prefix}-api"
  retention_in_days = 30
  tags              = merge(var.tags, { Name = "${local.name_prefix}-api-logs" })
}

# ── Lambda integrations (one per non-scheduled handler group) ────────────────

resource "aws_apigatewayv2_integration" "lambda" {
  for_each = setsubtract(local.lambda_groups, toset(["scheduled"]))

  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.handlers[each.key].invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

# ── Route definitions ────────────────────────────────────────────────────────
# Authenticated routes (JWT authorizer attached)

locals {
  authenticated_routes = {
    # ── auth handler ──
    "auth-POST /auth/{proxy+}"                = "auth"
    "auth-GET /users/me"                      = "auth"
    "auth-GET /users/{uid}"                   = "auth"
    "auth-GET /users/superadmins"             = "auth"

    # ── bookings handler ──
    "bookings-POST /bookings/{proxy+}"        = "bookings"
    "bookings-GET /sessions/{proxy+}"         = "bookings"
    "bookings-GET /booking-requests/{proxy+}" = "bookings"
    "bookings-POST /sessions/{proxy+}"        = "bookings"

    # ── schools handler ──
    "schools-GET /schools"                    = "schools"
    "schools-GET /schools/{proxy+}"           = "schools"
    "schools-POST /schools/{proxy+}"          = "schools"
    "schools-PATCH /schools/{proxy+}"         = "schools"
    "schools-GET /tutors/{uid}/slots"         = "schools"
    "schools-GET /availability/{proxy+}"      = "schools"
    "schools-POST /availability/{proxy+}"     = "schools"
    "schools-DELETE /availability/{proxy+}"   = "schools"
    "schools-PATCH /availability/{proxy+}"    = "schools"
    "schools-GET /stats/{proxy+}"             = "schools"
    "schools-GET /audit-log/{proxy+}"         = "schools"

    # ── reviews handler ──
    "reviews-POST /reviews/{proxy+}"          = "reviews"
    "reviews-GET /reviews/{proxy+}"           = "reviews"
    "reviews-GET /tutors/{uid}/reviews"       = "reviews"

    # ── misc handler ──
    "misc-POST /recommendations/{proxy+}"     = "misc"
  }

  # Public routes (no JWT authorizer)
  public_routes = {
    "misc-POST /contact/{proxy+}"  = "misc"
    "schools-POST /schools/register" = "schools"
  }
}

resource "aws_apigatewayv2_route" "authenticated" {
  for_each = local.authenticated_routes

  api_id             = aws_apigatewayv2_api.main.id
  route_key          = regex("^[a-z]+-(.+)$", each.key)[0]
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  target             = "integrations/${aws_apigatewayv2_integration.lambda[each.value].id}"
}

resource "aws_apigatewayv2_route" "public" {
  for_each = local.public_routes

  api_id    = aws_apigatewayv2_api.main.id
  route_key = regex("^[a-z]+-(.+)$", each.key)[0]
  target    = "integrations/${aws_apigatewayv2_integration.lambda[each.value].id}"
}
