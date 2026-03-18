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
