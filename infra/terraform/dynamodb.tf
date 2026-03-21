# PeerTutor — DynamoDB tables (replaces Firestore)
# All tables use PAY_PER_REQUEST (on-demand) billing and point-in-time recovery.

locals {
  # Table definitions: key = logical name, value = config
  dynamodb_tables = {
    users = {
      name      = "${var.project_name}-users"
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
      name      = "${var.project_name}-availability-slots"
      hash_key  = "tutorUid"
      range_key = "id"
      ttl_attribute = null
      attributes = [
        { name = "tutorUid", type = "S" },
        { name = "id", type = "S" },
        { name = "schoolDomain", type = "S" },
      ]
      global_secondary_indexes = [
        {
          name            = "SchoolDomainIndex"
          hash_key        = "schoolDomain"
          range_key       = "tutorUid"
          projection_type = "ALL"
        },
      ]
    }

    sessions = {
      name      = "${var.project_name}-sessions"
      hash_key  = "id"
      range_key = null
      ttl_attribute = null
      attributes = [
        { name = "id", type = "S" },
        { name = "tutorUid", type = "S" },
        { name = "tuteeUid", type = "S" },
        { name = "schoolDomain", type = "S" },
      ]
      global_secondary_indexes = [
        {
          name            = "TutorIndex"
          hash_key        = "tutorUid"
          range_key       = null
          projection_type = "ALL"
        },
        {
          name            = "TuteeIndex"
          hash_key        = "tuteeUid"
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
      name      = "${var.project_name}-booking-requests"
      hash_key  = "id"
      range_key = null
      ttl_attribute = null
      attributes = [
        { name = "id", type = "S" },
        { name = "tutorUid", type = "S" },
        { name = "tuteeUid", type = "S" },
      ]
      global_secondary_indexes = [
        {
          name            = "TutorIndex"
          hash_key        = "tutorUid"
          range_key       = null
          projection_type = "ALL"
        },
        {
          name            = "TuteeIndex"
          hash_key        = "tuteeUid"
          range_key       = null
          projection_type = "ALL"
        },
      ]
    }

    reviews = {
      name      = "${var.project_name}-reviews"
      hash_key  = "id"
      range_key = null
      ttl_attribute = null
      attributes = [
        { name = "id", type = "S" },
        { name = "tutorUid", type = "S" },
        { name = "schoolDomain", type = "S" },
      ]
      global_secondary_indexes = [
        {
          name            = "TutorIndex"
          hash_key        = "tutorUid"
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
      name      = "${var.project_name}-schools"
      hash_key  = "domain"
      range_key = null
      ttl_attribute = null
      attributes = [
        { name = "domain", type = "S" },
      ]
      global_secondary_indexes = []
    }

    stats = {
      name      = "${var.project_name}-stats"
      hash_key  = "domain"
      range_key = null
      ttl_attribute = null
      attributes = [
        { name = "domain", type = "S" },
      ]
      global_secondary_indexes = []
    }

    email-verifications = {
      name      = "${var.project_name}-email-verifications"
      hash_key  = "email"
      range_key = null
      ttl_attribute = "expiresAt"
      attributes = [
        { name = "email", type = "S" },
      ]
      global_secondary_indexes = []
    }

    rate-limits = {
      name      = "${var.project_name}-rate-limits"
      hash_key  = "key"
      range_key = null
      ttl_attribute = "expiresAt"
      attributes = [
        { name = "key", type = "S" },
      ]
      global_secondary_indexes = []
    }

    admin-audit-log = {
      name      = "${var.project_name}-admin-audit-log"
      hash_key  = "domain"
      range_key = "timestamp"
      ttl_attribute = null
      attributes = [
        { name = "domain", type = "S" },
        { name = "timestamp", type = "S" },
      ]
      global_secondary_indexes = []
    }

    contact-submissions = {
      name      = "${var.project_name}-contact-submissions"
      hash_key  = "id"
      range_key = null
      ttl_attribute = null
      attributes = [
        { name = "id", type = "S" },
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
