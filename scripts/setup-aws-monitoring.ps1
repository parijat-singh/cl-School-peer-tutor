# =============================================================================
# AWS Monitoring & Alerting Setup for School Peer Tutor
# =============================================================================
# Creates:
#   1. SNS topic  -> email alerts to schoolpeertutor@outlook.com
#   2. CloudWatch alarms for CloudFront (5xx errors, 4xx errors, latency)
#   3. CloudWatch alarm for S3 4xx errors
#   4. AWS Budget alarm (cost threshold)
#
# Run once from your machine:
#   .\scripts\setup-aws-monitoring.ps1
# =============================================================================

$PROFILE      = "schoolpeertutor"
$REGION       = "us-east-1"          # CloudFront metrics are ALWAYS in us-east-1
$CF_DIST_ID   = "E348UFZNGBKEPO"
$S3_BUCKET    = "schoolpeertutor-frontend-prod"
$ALERT_EMAIL  = "schoolpeertutor@outlook.com"
$APP_NAME     = "SchoolPeerTutor"

Write-Host "`n=== Setting up AWS Monitoring for $APP_NAME ===" -ForegroundColor Cyan

# ── 1. SNS Topic for alerts ──────────────────────────────────────────────────
Write-Host "`n[1/5] Creating SNS alert topic..." -ForegroundColor Yellow

$SNS_ARN = aws sns create-topic `
    --name "$APP_NAME-alerts" `
    --profile $PROFILE `
    --region $REGION `
    --query "TopicArn" `
    --output text

Write-Host "SNS topic: $SNS_ARN"

# Subscribe admin email
aws sns subscribe `
    --topic-arn $SNS_ARN `
    --protocol email `
    --notification-endpoint $ALERT_EMAIL `
    --profile $PROFILE `
    --region $REGION | Out-Null

Write-Host "Subscribed $ALERT_EMAIL - CHECK YOUR INBOX and confirm the subscription!" -ForegroundColor Magenta

# ── 2. Enable CloudFront additional metrics (needed for detailed alarms) ──────
Write-Host "`n[2/5] Enabling CloudFront additional metrics..." -ForegroundColor Yellow

aws cloudfront create-monitoring-subscription `
    --distribution-id $CF_DIST_ID `
    --monitoring-subscription '{"RealtimeMetricsSubscriptionConfig":{"RealtimeMetricsSubscriptionStatus":"Enabled"}}' `
    --profile $PROFILE 2>$null

Write-Host "CloudFront enhanced metrics enabled"

# ── 3. CloudFront CloudWatch Alarms ──────────────────────────────────────────
Write-Host "`n[3/5] Creating CloudFront alarms..." -ForegroundColor Yellow

# 5xx Error Rate > 1% for 5 minutes = server-side errors
aws cloudwatch put-metric-alarm `
    --alarm-name "$APP_NAME-CloudFront-5xx-ErrorRate" `
    --alarm-description "CloudFront 5xx error rate exceeded 1% - server errors on schoolpeertutor.com" `
    --namespace "AWS/CloudFront" `
    --metric-name "5xxErrorRate" `
    --dimensions Name=DistributionId,Value=$CF_DIST_ID Name=Region,Value=Global `
    --statistic Average `
    --period 300 `
    --evaluation-periods 1 `
    --threshold 1 `
    --comparison-operator GreaterThanOrEqualToThreshold `
    --alarm-actions $SNS_ARN `
    --ok-actions $SNS_ARN `
    --treat-missing-data notBreaching `
    --profile $PROFILE `
    --region $REGION
Write-Host "  Created: 5xx error rate alarm (>= 1%)"

# 4xx Error Rate > 10% for 5 minutes = client errors / possible attack
aws cloudwatch put-metric-alarm `
    --alarm-name "$APP_NAME-CloudFront-4xx-ErrorRate" `
    --alarm-description "CloudFront 4xx error rate exceeded 10% - possible broken links or attack" `
    --namespace "AWS/CloudFront" `
    --metric-name "4xxErrorRate" `
    --dimensions Name=DistributionId,Value=$CF_DIST_ID Name=Region,Value=Global `
    --statistic Average `
    --period 300 `
    --evaluation-periods 1 `
    --threshold 10 `
    --comparison-operator GreaterThanOrEqualToThreshold `
    --alarm-actions $SNS_ARN `
    --treat-missing-data notBreaching `
    --profile $PROFILE `
    --region $REGION
Write-Host "  Created: 4xx error rate alarm (>= 10%)"

# Origin latency > 3 seconds for 5 minutes = slow backend
aws cloudwatch put-metric-alarm `
    --alarm-name "$APP_NAME-CloudFront-OriginLatency" `
    --alarm-description "CloudFront origin latency exceeded 3 seconds - backend may be slow" `
    --namespace "AWS/CloudFront" `
    --metric-name "OriginLatency" `
    --dimensions Name=DistributionId,Value=$CF_DIST_ID Name=Region,Value=Global `
    --statistic p90 `
    --period 300 `
    --evaluation-periods 2 `
    --threshold 3000 `
    --comparison-operator GreaterThanOrEqualToThreshold `
    --alarm-actions $SNS_ARN `
    --treat-missing-data notBreaching `
    --profile $PROFILE `
    --region $REGION
Write-Host "  Created: origin latency alarm (p90 >= 3s)"

# ── 4. S3 CloudWatch Alarm ───────────────────────────────────────────────────
Write-Host "`n[4/5] Creating S3 alarm..." -ForegroundColor Yellow

# First enable S3 request metrics (needed for alarms)
aws s3api put-bucket-metrics-configuration `
    --bucket $S3_BUCKET `
    --id EntireBucket `
    --metrics-configuration '{"Id":"EntireBucket"}' `
    --profile $PROFILE `
    --region $REGION 2>$null

aws cloudwatch put-metric-alarm `
    --alarm-name "$APP_NAME-S3-4xx-Errors" `
    --alarm-description "S3 4xx errors detected - possible broken asset references" `
    --namespace "AWS/S3" `
    --metric-name "4xxErrors" `
    --dimensions Name=BucketName,Value=$S3_BUCKET Name=FilterId,Value=EntireBucket `
    --statistic Sum `
    --period 300 `
    --evaluation-periods 1 `
    --threshold 50 `
    --comparison-operator GreaterThanOrEqualToThreshold `
    --alarm-actions $SNS_ARN `
    --treat-missing-data notBreaching `
    --profile $PROFILE `
    --region $REGION
Write-Host "  Created: S3 4xx errors alarm (>= 50 in 5 min)"

# ── 5. AWS Budget alarm ───────────────────────────────────────────────────────
Write-Host "`n[5/5] Creating AWS Budget alarm (monthly $50 threshold)..." -ForegroundColor Yellow

$ACCOUNT_ID = aws sts get-caller-identity `
    --profile $PROFILE `
    --query "Account" `
    --output text

$BUDGET_JSON = @"
{
  "BudgetName": "$APP_NAME-monthly",
  "BudgetLimit": { "Amount": "50", "Unit": "USD" },
  "TimeUnit": "MONTHLY",
  "BudgetType": "COST"
}
"@

$NOTIFICATION_JSON = @"
[
  {
    "Notification": {
      "NotificationType": "ACTUAL",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 80,
      "ThresholdType": "PERCENTAGE"
    },
    "Subscribers": [
      { "SubscriptionType": "EMAIL", "Address": "$ALERT_EMAIL" }
    ]
  },
  {
    "Notification": {
      "NotificationType": "FORECASTED",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 100,
      "ThresholdType": "PERCENTAGE"
    },
    "Subscribers": [
      { "SubscriptionType": "EMAIL", "Address": "$ALERT_EMAIL" }
    ]
  }
]
"@

aws budgets create-budget `
    --account-id $ACCOUNT_ID `
    --budget $BUDGET_JSON `
    --notifications-with-subscribers $NOTIFICATION_JSON `
    --profile $PROFILE 2>$null

Write-Host "  Created: Budget alarm (alert at 80% of USD 50, forecast at 100%)"

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host "`n=== Monitoring Setup Complete ===" -ForegroundColor Green
Write-Host @"

Alarms created:
  CloudFront 5xx error rate  >= 1%     -> email alert
  CloudFront 4xx error rate  >= 10%    -> email alert
  CloudFront origin latency  >= 3s p90 -> email alert
  S3 4xx errors              >= 50/5m  -> email alert
  Monthly AWS cost           >= USD 40 (80% of 50) -> email alert
  Monthly AWS cost forecast  >= USD 50 -> email alert

IMPORTANT: Check $ALERT_EMAIL and confirm the SNS subscription email
           before alarms can send notifications!

View alarms: https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#alarmsV2
View budget:  https://us-east-1.console.aws.amazon.com/billing/home#/budgets
"@
