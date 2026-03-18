# WAFv2 for CloudFront (scope CLOUDFRONT) — must live in us-east-1 (same as this stack).

resource "aws_wafv2_web_acl" "frontend" {
  count = var.enable_waf ? 1 : 0

  name  = "${local.name_prefix}-frontend-waf"
  scope = "CLOUDFRONT"

  default_action {
    allow {}
  }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 10

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-common"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name_prefix}-waf"
    sampled_requests_enabled   = true
  }

  tags = merge(var.tags, { Name = "${local.name_prefix}-frontend-waf" })
}
