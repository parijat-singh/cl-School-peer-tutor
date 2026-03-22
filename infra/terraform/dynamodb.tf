# PeerTutor — DynamoDB tables (replaces Firestore)
# All tables use PAY_PER_REQUEST (on-demand) billing and point-in-time recovery.

locals {
  # Table definitions: key = logical name, value = config
  dynamodb_tables = {
    users = {
      name      = "${local.name_prefix}-users"
      hash_key  = "uid"
      range_key = null
      ttl_attribute = null
      attributes = [
        { name = "uid", type = "S" },
        { name = "schoolDomain", type = "S" },
        { name = "email", type = "S" },
      ]
      global_secondary_indexes = [
        {
          name            = "SchoolDomainIndex"
          hash_key        = "schoolDomain"
          range_key       = "uid"
          projection_type = "ALL"
        },
        {
          name            = "EmailIndex"
          hash_key        = "email"
          range_key       = "uid"
          projection_type = "ALL"
        },
      ]
    }

    availability-slots = {
      name      = "${local.name_prefix}-availability-slots"
      hash_key  = "tutorId"
      range_key = "slotId"
      ttl_attribute = null
      attributes = [
        { name = "tutorId", type = "S" },
        { name = "slotId", type = "S" },
        { name = "schoolDomain", type = "S" },
      ]
      global_secondary_indexes = [
        {
          name            = "SchoolDomainIndex"
          hash_key        = "schoolDomain"
          range_key       = "tutorId"
          projection_type = "ALL"
        },
      ]
    }

    sessions = {
      name      = "${local.name_prefix}-sessions"
      hash_key  = "sessionId"
      range_key = null
      ttl_attribute = null
      attributes = [
        { name = "sessionId", type = "S" },
        { name = "tutorId", type = "S" },
        { name = "tuteeId", type = "S" },
        { name = "schoolDomain", type = "S" },
      ]
      global_secondary_indexes = [
        {
          name            = "TutorIndex"
          hash_key        = "tutorId"
          range_key       = null
          projection_type = "ALL"
        },
        {
          name            = "TuteeIndex"
          hash_key        = "tuteeId"
          range_key       = null
          projection_type = "ALL"
        },
        {
          name            = "SchoolDomainIndex"
          hash_key        = "schoolDomain"
          range_key       = null
          projection_type = "ALL"
        },
      ]
    }

    booking-requests = {
      name      = "${local.name_prefix}-booking-requests"
      hash_key  = "requestId"
      range_key = null
      ttl_attribute = null
      attributes = [
        { name = "requestId", type = "S" },
        { name = "tutorId", type = "S" },
        { name = "tuteeId", type = "S" },
      ]
      global_secondary_indexes = [
        {
          name            = "TutorIndex"
          hash_key        = "tutorId"
          range_key       = null
          projection_type = "ALL"
        },
        {
          name            = "TuteeIndex"
          hash_key        = "tuteeId"
          range_key       = null
          projection_type = "ALL"
        },
      ]
    }

    reviews = {
      name      = "${local.name_prefix}-reviews"
      hash_key  = "reviewId"
      range_key = null
      ttl_attribute = null
      attributes = [
        { name = "reviewId", type = "S" },
        { name = "tutorId", type = "S" },
        { name = "schoolDomain", type = "S" },
      ]
      global_secondary_indexes = [
        {
          name            = "TutorIndex"
          hash_key        = "tutorId"
          range_key       = null
          projection_type = "ALL"
        },
        {
          name            = "SchoolDomainIndex"
          hash_key        = "schoolDomain"
          range_key       = null
          projection_type = "ALL"
        },
      ]
    }

    schools = {
      name      = "${local.name_prefix}-schools"
      hash_key  = "domain"
      range_key = null
      ttl_attribute = null
      attributes = [
        { name = "domain", type = "S" },
      ]
      global_secondary_indexes = []
    }

    stats = {
      name      = "${local.name_prefix}-stats"
      hash_key  = "schoolDomain"
      range_key = null
      ttl_attribute = null
      attributes = [
        { name = "schoolDomain", type = "S" },
      ]
      global_secondary_indexes = []
    }

    email-verifications = {
      name      = "${local.name_prefix}-email-verifications"
      hash_key  = "uid"
      range_key = null
      ttl_attribute = "expiresAt"
      attributes = [
        { name = "uid", type = "S" },
      ]
      global_secondary_indexes = []
    }

    rate-limits = {
      name      = "${local.name_prefix}-rate-limits"
      hash_key  = "key"
      range_key = null
      ttl_attribute = "expiresAt"
      attributes = [
        { name = "key", type = "S" },
      ]
      global_secondary_indexes = []
    }

    admin-audit-log = {
      name      = "${local.name_prefix}-admin-audit-log"
      hash_key  = "schoolDomain"
      range_key = "timestampLogId"
      ttl_attribute = null
      attributes = [
        { name = "schoolDomain", type = "S" },
        { name = "timestampLogId", type = "S" },
      ]
      global_secondary_indexes = []
    }

    contact-submissions = {
      name      = "${local.name_prefix}-contact-submissions"
      hash_key  = "submissionId"
      range_key = null
      ttl_attribute = "expiresAt"
      attributes = [
        { name = "submissionId", type = "S" },
      ]
      global_secondary_indexes = []
    }
  }
}

resource "aws_dynamodb_table" "tables" {
  for_each = local.dynamodb_tables

  name         = each.value.name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = each.value.hash_key
  range_key    = each.value.range_key

  dynamic "attribute" {
    for_each = each.value.attributes
    content {
      name = attribute.value.name
      type = attribute.value.type
    }
  }

  dynamic "global_secondary_index" {
    for_each = each.value.global_secondary_indexes
    content {
      name            = global_secondary_index.value.name
      hash_key        = global_secondary_index.value.hash_key
      range_key       = global_secondary_index.value.range_key
      projection_type = global_secondary_index.value.projection_type
    }
  }

  dynamic "ttl" {
    for_each = each.value.ttl_attribute != null ? [each.value.ttl_attribute] : []
    content {
      attribute_name = ttl.value
      enabled        = true
    }
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = merge(var.tags, { Name = each.value.name })
}
