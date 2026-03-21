# PeerTutor — DynamoDB tables (Phase 2: replaces Firestore)
# All tables use PAY_PER_REQUEST (on-demand) billing — no capacity planning needed.

# ── Users ────────────────────────────────────────────────────────────────────
resource "aws_dynamodb_table" "users" {
  name         = "${local.name_prefix}-users"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "uid"

  attribute {
    name = "uid"
    type = "S"
  }
  attribute {
    name = "schoolDomain"
    type = "S"
  }
  attribute {
    name = "role"
    type = "S"
  }

  global_secondary_index {
    name            = "schoolDomain-role-index"
    hash_key        = "schoolDomain"
    range_key       = "role"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "role-index"
    hash_key        = "role"
    projection_type = "ALL"
  }

  tags = merge(var.tags, { Name = "${local.name_prefix}-users" })
}

# ── Availability Slots ───────────────────────────────────────────────────────
resource "aws_dynamodb_table" "availability_slots" {
  name         = "${local.name_prefix}-availability-slots"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "tutorId"
  range_key    = "slotId"

  attribute {
    name = "tutorId"
    type = "S"
  }
  attribute {
    name = "slotId"
    type = "S"
  }

  tags = merge(var.tags, { Name = "${local.name_prefix}-availability-slots" })
}

# ── Sessions ─────────────────────────────────────────────────────────────────
resource "aws_dynamodb_table" "sessions" {
  name         = "${local.name_prefix}-sessions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "sessionId"

  attribute {
    name = "sessionId"
    type = "S"
  }
  attribute {
    name = "tutorId"
    type = "S"
  }
  attribute {
    name = "tuteeId"
    type = "S"
  }
  attribute {
    name = "status"
    type = "S"
  }
  attribute {
    name = "scheduledDate"
    type = "S"
  }
  attribute {
    name = "schoolDomain"
    type = "S"
  }

  global_secondary_index {
    name            = "tutorId-status-index"
    hash_key        = "tutorId"
    range_key       = "status"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "tuteeId-status-index"
    hash_key        = "tuteeId"
    range_key       = "status"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "status-scheduledDate-index"
    hash_key        = "status"
    range_key       = "scheduledDate"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "schoolDomain-status-index"
    hash_key        = "schoolDomain"
    range_key       = "status"
    projection_type = "ALL"
  }

  tags = merge(var.tags, { Name = "${local.name_prefix}-sessions" })
}

# ── Booking Requests ─────────────────────────────────────────────────────────
resource "aws_dynamodb_table" "booking_requests" {
  name         = "${local.name_prefix}-booking-requests"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "requestId"

  attribute {
    name = "requestId"
    type = "S"
  }
  attribute {
    name = "tutorId"
    type = "S"
  }
  attribute {
    name = "tuteeId"
    type = "S"
  }
  attribute {
    name = "status"
    type = "S"
  }
  attribute {
    name = "createdAt"
    type = "S"
  }
  attribute {
    name = "slotId"
    type = "S"
  }
  attribute {
    name = "scheduledDate"
    type = "S"
  }

  global_secondary_index {
    name            = "tutorId-status-index"
    hash_key        = "tutorId"
    range_key       = "status"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "tuteeId-createdAt-index"
    hash_key        = "tuteeId"
    range_key       = "createdAt"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "slotId-scheduledDate-index"
    hash_key        = "slotId"
    range_key       = "scheduledDate"
    projection_type = "ALL"
  }

  tags = merge(var.tags, { Name = "${local.name_prefix}-booking-requests" })
}

# ── Reviews ──────────────────────────────────────────────────────────────────
resource "aws_dynamodb_table" "reviews" {
  name         = "${local.name_prefix}-reviews"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "reviewId"

  attribute {
    name = "reviewId"
    type = "S"
  }
  attribute {
    name = "targetId"
    type = "S"
  }
  attribute {
    name = "schoolDomain"
    type = "S"
  }
  attribute {
    name = "createdAt"
    type = "S"
  }

  global_secondary_index {
    name            = "targetId-createdAt-index"
    hash_key        = "targetId"
    range_key       = "createdAt"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "schoolDomain-createdAt-index"
    hash_key        = "schoolDomain"
    range_key       = "createdAt"
    projection_type = "ALL"
  }

  tags = merge(var.tags, { Name = "${local.name_prefix}-reviews" })
}

# ── Schools ──────────────────────────────────────────────────────────────────
resource "aws_dynamodb_table" "schools" {
  name         = "${local.name_prefix}-schools"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "domain"

  attribute {
    name = "domain"
    type = "S"
  }
  attribute {
    name = "status"
    type = "S"
  }

  global_secondary_index {
    name            = "status-index"
    hash_key        = "status"
    projection_type = "ALL"
  }

  tags = merge(var.tags, { Name = "${local.name_prefix}-schools" })
}

# ── Stats ────────────────────────────────────────────────────────────────────
resource "aws_dynamodb_table" "stats" {
  name         = "${local.name_prefix}-stats"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "schoolDomain"

  attribute {
    name = "schoolDomain"
    type = "S"
  }

  tags = merge(var.tags, { Name = "${local.name_prefix}-stats" })
}

# ── Email Verifications (TTL auto-cleanup) ───────────────────────────────────
resource "aws_dynamodb_table" "email_verifications" {
  name         = "${local.name_prefix}-email-verifications"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "uid"

  attribute {
    name = "uid"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  tags = merge(var.tags, { Name = "${local.name_prefix}-email-verifications" })
}

# ── Rate Limits (TTL auto-cleanup — replaces purgeExpiredRateLimits) ─────────
resource "aws_dynamodb_table" "rate_limits" {
  name         = "${local.name_prefix}-rate-limits"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "key"

  attribute {
    name = "key"
    type = "S"
  }

  ttl {
    attribute_name = "resetAtEpoch"
    enabled        = true
  }

  tags = merge(var.tags, { Name = "${local.name_prefix}-rate-limits" })
}

# ── Admin Audit Log ──────────────────────────────────────────────────────────
resource "aws_dynamodb_table" "admin_audit_log" {
  name         = "${local.name_prefix}-admin-audit-log"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "schoolDomain"
  range_key    = "timestampLogId"

  attribute {
    name = "schoolDomain"
    type = "S"
  }
  attribute {
    name = "timestampLogId"
    type = "S"
  }

  tags = merge(var.tags, { Name = "${local.name_prefix}-admin-audit-log" })
}

# ── Contact Submissions (TTL: 90 days) ───────────────────────────────────────
resource "aws_dynamodb_table" "contact_submissions" {
  name         = "${local.name_prefix}-contact-submissions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "submissionId"

  attribute {
    name = "submissionId"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  tags = merge(var.tags, { Name = "${local.name_prefix}-contact-submissions" })
}
