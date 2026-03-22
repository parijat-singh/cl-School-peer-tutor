# PeerTutor — Terraform outputs (use these for GitHub Secrets and deploy script)

output "s3_bucket_name" {
  description = "S3 bucket name for frontend static assets"
  value       = aws_s3_bucket.frontend.id
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (for cache invalidation)"
  value       = aws_cloudfront_distribution.frontend.id
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain (e.g. xxx.cloudfront.net)"
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "cloudfront_url" {
  description = "URL of the frontend via CloudFront (until custom domain is configured)"
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

output "github_deploy_iam_user_arn" {
  description = "IAM user for GitHub Actions deploy — create access key and add to GitHub Secrets"
  value       = aws_iam_user.github_deploy.arn
}

output "github_deploy_iam_user_name" {
  description = "IAM user name — use with: aws iam create-access-key --user-name <this>"
  value       = aws_iam_user.github_deploy.name
}

output "acm_certificate_validation_records" {
  description = "DNS CNAMEs to create when create_acm_certificate=true and route53_zone_id is empty (validate cert, then set acm_certificate_arn and enable_custom_domain)"
  value       = length(aws_acm_certificate.frontend) > 0 ? aws_acm_certificate.frontend[0].domain_validation_options : []
}

output "waf_web_acl_arn" {
  description = "WAF ACL attached to CloudFront when enable_waf=true"
  value       = var.enable_waf ? aws_wafv2_web_acl.frontend[0].arn : null
}

# ── Cognito ──────────────────────────────────────────────────────────────────
output "cognito_user_pool_id" {
  description = "Cognito User Pool ID (set as VITE_COGNITO_USER_POOL_ID and COGNITO_USER_POOL_ID)"
  value       = aws_cognito_user_pool.main.id
}

output "cognito_user_pool_arn" {
  description = "Cognito User Pool ARN"
  value       = aws_cognito_user_pool.main.arn
}

output "cognito_app_client_id" {
  description = "Cognito App Client ID (set as VITE_COGNITO_CLIENT_ID and COGNITO_APP_CLIENT_ID)"
  value       = aws_cognito_user_pool_client.spa.id
}

output "cognito_jwks_uri" {
  description = "JWKS URI for backend JWT verification"
  value       = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}/.well-known/jwks.json"
}

output "cognito_issuer" {
  description = "Cognito token issuer URL"
  value       = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
}

output "cognito_backend_iam_user_name" {
  description = "IAM user for backend Cognito admin ops — create access key and add to Firebase env"
  value       = aws_iam_user.cognito_backend.name
}

# ── API Gateway ──────────────────────────────────────────────────────────────

output "api_gateway_url" {
  description = "HTTP API invoke URL (base URL for backend requests)"
  value       = aws_apigatewayv2_api.main.api_endpoint
}

output "api_gateway_id" {
  description = "API Gateway HTTP API ID"
  value       = aws_apigatewayv2_api.main.id
}

# ── Lambda ───────────────────────────────────────────────────────────────────

output "lambda_function_names" {
  description = "Map of handler group to Lambda function name"
  value       = { for k, v in aws_lambda_function.handlers : k => v.function_name }
}

# ── DynamoDB ─────────────────────────────────────────────────────────────────

output "dynamodb_table_names" {
  description = "Map of logical table name to physical DynamoDB table name"
  value       = { for k, v in aws_dynamodb_table.tables : k => v.name }
}

# ── S3 Logos ─────────────────────────────────────────────────────────────────

output "logos_bucket_name" {
  description = "S3 bucket name for school logo uploads"
  value       = aws_s3_bucket.logos.id
}

output "lambda_deploy_bucket" {
  description = "S3 bucket for Lambda deployment zips (set as LAMBDA_DEPLOY_BUCKET GitHub secret)"
  value       = local.lambda_deploy_bucket
}
