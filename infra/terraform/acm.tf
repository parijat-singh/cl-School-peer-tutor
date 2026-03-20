# ACM in us-east-1 (required for CloudFront). Provider region must be us-east-1.

resource "aws_acm_certificate" "frontend" {
  count = var.create_acm_certificate && var.domain_name != "" ? 1 : 0

  domain_name               = var.domain_name
  subject_alternative_names = ["www.${var.domain_name}"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(var.tags, { Name = "${local.name_prefix}-frontend-cert" })
}

resource "aws_route53_record" "acm_validation" {
  for_each = var.create_acm_certificate && var.route53_zone_id != "" && var.domain_name != "" ? {
    for dvo in aws_acm_certificate.frontend[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  } : {}

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = var.route53_zone_id
}

resource "aws_acm_certificate_validation" "frontend" {
  count = var.create_acm_certificate && var.route53_zone_id != "" && var.domain_name != "" ? 1 : 0

  certificate_arn         = aws_acm_certificate.frontend[0].arn
  validation_record_fqdns = [for r in aws_route53_record.acm_validation : r.fqdn]
}
