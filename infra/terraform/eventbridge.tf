# PeerTutor — EventBridge scheduled rules (Phase 2: replaces Firebase scheduled functions)

# ── Send Session Reminders (every 60 minutes) ───────────────────────────────
resource "aws_cloudwatch_event_rule" "send_reminders" {
  name                = "${local.name_prefix}-send-reminders"
  description         = "Trigger session reminder emails (24h and 1h before)"
  schedule_expression = "rate(60 minutes)"
  tags                = var.tags
}

resource "aws_cloudwatch_event_target" "send_reminders" {
  rule = aws_cloudwatch_event_rule.send_reminders.name
  arn  = aws_lambda_function.scheduled.arn
  input = jsonencode({ action = "sendSessionReminders" })
}

resource "aws_lambda_permission" "eventbridge_reminders" {
  statement_id  = "AllowEventBridgeReminders"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.scheduled.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.send_reminders.arn
}

# ── Trigger Rating Prompts (every 15 minutes) ───────────────────────────────
resource "aws_cloudwatch_event_rule" "trigger_ratings" {
  name                = "${local.name_prefix}-trigger-ratings"
  description         = "Prompt users to rate completed sessions"
  schedule_expression = "rate(15 minutes)"
  tags                = var.tags
}

resource "aws_cloudwatch_event_target" "trigger_ratings" {
  rule = aws_cloudwatch_event_rule.trigger_ratings.name
  arn  = aws_lambda_function.scheduled.arn
  input = jsonencode({ action = "triggerRatingPrompts" })
}

resource "aws_lambda_permission" "eventbridge_ratings" {
  statement_id  = "AllowEventBridgeRatings"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.scheduled.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.trigger_ratings.arn
}

# ── Update School Stats (every 60 minutes) ──────────────────────────────────
resource "aws_cloudwatch_event_rule" "update_stats" {
  name                = "${local.name_prefix}-update-stats"
  description         = "Recalculate school statistics (replaces Firestore onWrite trigger)"
  schedule_expression = "rate(60 minutes)"
  tags                = var.tags
}

resource "aws_cloudwatch_event_target" "update_stats" {
  rule = aws_cloudwatch_event_rule.update_stats.name
  arn  = aws_lambda_function.scheduled.arn
  input = jsonencode({ action = "updateSchoolStats" })
}

resource "aws_lambda_permission" "eventbridge_stats" {
  statement_id  = "AllowEventBridgeStats"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.scheduled.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.update_stats.arn
}

# ── Purge Old Sessions (every 24 hours) ─────────────────────────────────────
resource "aws_cloudwatch_event_rule" "purge_sessions" {
  name                = "${local.name_prefix}-purge-sessions"
  description         = "Delete sessions older than 24 months (data retention)"
  schedule_expression = "rate(24 hours)"
  tags                = var.tags
}

resource "aws_cloudwatch_event_target" "purge_sessions" {
  rule = aws_cloudwatch_event_rule.purge_sessions.name
  arn  = aws_lambda_function.scheduled.arn
  input = jsonencode({ action = "purgeOldSessions" })
}

resource "aws_lambda_permission" "eventbridge_purge" {
  statement_id  = "AllowEventBridgePurge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.scheduled.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.purge_sessions.arn
}
