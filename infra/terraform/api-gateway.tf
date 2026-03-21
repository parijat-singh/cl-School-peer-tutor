# PeerTutor — API Gateway HTTP API (Phase 2: replaces Firebase callable functions)

# ── HTTP API ─────────────────────────────────────────────────────────────────
resource "aws_apigatewayv2_api" "backend" {
  name          = "${local.name_prefix}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = compact([
      "http://localhost:5173",
      "http://localhost:3000",
      var.domain_name != "" ? "https://${var.domain_name}" : "",
      var.domain_name != "" ? "https://www.${var.domain_name}" : "",
      "https://${aws_cloudfront_distribution.frontend.domain_name}",
    ])
    allow_methods = ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization"]
    max_age       = 86400
  }

  tags = merge(var.tags, { Name = "${local.name_prefix}-api" })
}

# ── Stage (auto-deploy) ─────────────────────────────────────────────────────
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.backend.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn
    format = jsonencode({
      requestId    = "$context.requestId"
      ip           = "$context.identity.sourceIp"
      method       = "$context.httpMethod"
      path         = "$context.path"
      status       = "$context.status"
      responseLen  = "$context.responseLength"
      latency      = "$context.responseLatency"
      integLatency = "$context.integrationLatency"
    })
  }

  tags = merge(var.tags, { Name = "${local.name_prefix}-api-default" })
}

resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/apigateway/${local.name_prefix}-api"
  retention_in_days = 14
  tags              = var.tags
}

# ── JWT authorizer (Cognito) ────────────────────────────────────────────────
resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.backend.id
  authorizer_type  = "JWT"
  name             = "cognito"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.spa.id]
    issuer   = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
  }
}

# ── Lambda integrations ─────────────────────────────────────────────────────
resource "aws_apigatewayv2_integration" "auth" {
  api_id                 = aws_apigatewayv2_api.backend.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.auth.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "bookings" {
  api_id                 = aws_apigatewayv2_api.backend.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.bookings.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "schools" {
  api_id                 = aws_apigatewayv2_api.backend.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.schools.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "reviews" {
  api_id                 = aws_apigatewayv2_api.backend.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.reviews.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "misc" {
  api_id                 = aws_apigatewayv2_api.backend.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.misc.invoke_arn
  payload_format_version = "2.0"
}

# ── Lambda invoke permissions (allow API Gateway to call each Lambda) ────────
resource "aws_lambda_permission" "apigw_auth" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.auth.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.backend.execution_arn}/*/*"
}

resource "aws_lambda_permission" "apigw_bookings" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.bookings.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.backend.execution_arn}/*/*"
}

resource "aws_lambda_permission" "apigw_schools" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.schools.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.backend.execution_arn}/*/*"
}

resource "aws_lambda_permission" "apigw_reviews" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.reviews.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.backend.execution_arn}/*/*"
}

resource "aws_lambda_permission" "apigw_misc" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.misc.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.backend.execution_arn}/*/*"
}

# ── Routes: Auth & Users (JWT-protected) ─────────────────────────────────────
locals {
  auth_routes = [
    "POST /auth/initialize-user",
    "POST /auth/send-verification-otp",
    "POST /auth/verify-email-otp",
    "POST /auth/update-tutor-profile",
    "POST /auth/promote-superadmin",
    "POST /auth/admin-suspend-user",
    "POST /auth/admin-unsuspend-user",
    "GET /users/me",
    "GET /users/superadmins",
    "GET /users/{uid}",
  ]

  booking_routes = [
    "POST /bookings/book-session",
    "POST /bookings/request",
    "POST /bookings/respond",
    "POST /bookings/cancel-request",
    "POST /sessions/cancel",
    "GET /sessions/mine",
    "GET /booking-requests/mine",
  ]

  school_routes = [
    "POST /schools/add",
    "POST /schools/approve",
    "POST /schools/reject",
    "POST /schools/remove",
    "PATCH /schools/{domain}/profile",
    "POST /schools/{domain}/logo",
    "GET /schools/{domain}",
    "GET /schools",
    "GET /stats/{domain}",
    "GET /audit-log/{domain}",
    "POST /availability/add",
    "DELETE /availability/{slotId}",
    "PATCH /availability/{slotId}",
    "POST /availability/{slotId}/cancel-date",
    "POST /availability/{slotId}/uncancel-date",
    "GET /tutors/{uid}/slots",
  ]

  review_routes = [
    "POST /reviews/submit",
    "POST /reviews/admin-delete",
    "POST /reviews/{reviewId}/flag",
    "GET /tutors/{uid}/reviews",
    "GET /reviews/school/{domain}",
  ]

  misc_routes_auth = [
    "POST /recommendations/tutors",
  ]

  # Public routes (no JWT authorizer)
  public_routes_schools = [
    "POST /schools/register",
  ]
  public_routes_misc = [
    "POST /contact/submit",
  ]
}

# Auth routes (JWT-protected)
resource "aws_apigatewayv2_route" "auth" {
  for_each = toset(local.auth_routes)

  api_id             = aws_apigatewayv2_api.backend.id
  route_key          = each.value
  target             = "integrations/${aws_apigatewayv2_integration.auth.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

# Booking routes (JWT-protected)
resource "aws_apigatewayv2_route" "bookings" {
  for_each = toset(local.booking_routes)

  api_id             = aws_apigatewayv2_api.backend.id
  route_key          = each.value
  target             = "integrations/${aws_apigatewayv2_integration.bookings.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

# School routes (JWT-protected)
resource "aws_apigatewayv2_route" "schools" {
  for_each = toset(local.school_routes)

  api_id             = aws_apigatewayv2_api.backend.id
  route_key          = each.value
  target             = "integrations/${aws_apigatewayv2_integration.schools.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

# School public routes (no auth)
resource "aws_apigatewayv2_route" "schools_public" {
  for_each = toset(local.public_routes_schools)

  api_id    = aws_apigatewayv2_api.backend.id
  route_key = each.value
  target    = "integrations/${aws_apigatewayv2_integration.schools.id}"
}

# Review routes (JWT-protected)
resource "aws_apigatewayv2_route" "reviews" {
  for_each = toset(local.review_routes)

  api_id             = aws_apigatewayv2_api.backend.id
  route_key          = each.value
  target             = "integrations/${aws_apigatewayv2_integration.reviews.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

# Misc routes (JWT-protected)
resource "aws_apigatewayv2_route" "misc_auth" {
  for_each = toset(local.misc_routes_auth)

  api_id             = aws_apigatewayv2_api.backend.id
  route_key          = each.value
  target             = "integrations/${aws_apigatewayv2_integration.misc.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

# Misc public routes (no auth)
resource "aws_apigatewayv2_route" "misc_public" {
  for_each = toset(local.public_routes_misc)

  api_id    = aws_apigatewayv2_api.backend.id
  route_key = each.value
  target    = "integrations/${aws_apigatewayv2_integration.misc.id}"
}
