# PeerTutor — EventBridge rules for scheduled Lambda tasks

# ── Cleanup expired availability slots — daily at 3 AM UTC ──────────────────

resource "aws_cloudwatch_event_rule" "cleanup_expired_slots" {
  name                = "${var.project_name}-cleanup-expired-slots"
  description         = "Trigger cleanup of expired availability slots daily at 3 AM UTC"
  schedule_expression = "cron(0 3 * * ? *)"

  tags = merge(var.tags, { Name = "${var.project_name}-cleanup-expired-slots" })
}

resource "aws_cloudwatch_event_target" "cleanup_expired_slots" {
  rule      = aws_cloudwatch_event_rule.cleanup_expired_slots.name
  target_id = "scheduled-lambda-cleanup"
  arn       = aws_lambda_function.handlers["scheduled"].arn
  input     = jsonencode({ task = "cleanup-expired-slots" })
}

resource "aws_lambda_permission" "eventbridge_cleanup" {
  statement_id  = "AllowEventBridgeCleanup"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.handlers["scheduled"].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.cleanup_expired_slots.arn
}

# ── Session reminders — every 15 minutes ────────────────────────────────────

resource "aws_cloudwatch_event_rule" "session_reminders" {
  name                = "${var.project_name}-session-reminders"
  description         = "Trigger session reminder checks every 15 minutes"
  schedule_expression = "rate(15 minutes)"

  tags = merge(var.tags, { Name = "${var.project_name}-session-reminders" })
}

resource "aws_cloudwatch_event_target" "session_reminders" {
  rule      = aws_cloudwatch_event_rule.session_reminders.name
  target_id = "scheduled-lambda-reminders"
  arn       = aws_lambda_function.handlers["scheduled"].arn
  input     = jsonencode({ task = "session-reminders" })
}

resource "aws_lambda_permission" "eventbridge_reminders" {
  statement_id  = "AllowEventBridgeReminders"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.handlers["scheduled"].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.session_reminders.arn
}
