// Availability CRUD handlers for the schools Lambda group.
// POST   /availability/add
// DELETE /availability/{slotId}
// PATCH  /availability/{slotId}
// POST   /availability/{slotId}/cancel-date
// POST   /availability/{slotId}/uncancel-date
// GET    /tutors/{uid}/slots

import { PutCommand, DeleteCommand, UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ulid } from "ulid";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { getAuth } from "../../shared/auth.js";
import { json, error } from "../../shared/response.js";
import { parseBody, pathParam } from "../../shared/router.js";

export async function addAvailability(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getAuth(event);
  const body = parseBody<{
    recurring: boolean; day: string; date?: string;
    startTime: string; endTime: string; duration: number;
  }>(event);
  if (!body) return error(400, "Request body required.");

  const slotId = ulid();
  const now = new Date().toISOString();

  await ddb.send(new PutCommand({
    TableName: Tables.AvailabilitySlots,
    Item: {
      tutorId: caller.uid,
      slotId,
      recurring: body.recurring,
      day: body.day,
      date: body.date ?? null,
      startTime: body.startTime,
      endTime: body.endTime,
      duration: body.duration,
      booked: false,
      bookedDates: body.recurring ? {} : undefined,
      cancelledDates: body.recurring ? [] : undefined,
      schoolDomain: caller.schoolDomain,
      createdAt: now,
    },
  }));

  return json({ slotId });
}

export async function deleteAvailability(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getAuth(event);
  const slotId = pathParam(event, "slotId");

  await ddb.send(new DeleteCommand({
    TableName: Tables.AvailabilitySlots,
    Key: { tutorId: caller.uid, slotId },
  }));

  return json({ success: true });
}

export async function updateAvailability(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getAuth(event);
  const slotId = pathParam(event, "slotId");
  const body = parseBody<{ startTime?: string; endTime?: string; duration?: number }>(event);
  if (!body) return error(400, "Request body required.");

  const updates: string[] = [];
  const values: Record<string, unknown> = {};

  if (body.startTime) { updates.push("startTime = :st"); values[":st"] = body.startTime; }
  if (body.endTime) { updates.push("endTime = :et"); values[":et"] = body.endTime; }
  if (body.duration) { updates.push("duration = :dur"); values[":dur"] = body.duration; }

  if (updates.length === 0) return error(400, "No fields to update.");

  await ddb.send(new UpdateCommand({
    TableName: Tables.AvailabilitySlots,
    Key: { tutorId: caller.uid, slotId },
    UpdateExpression: `SET ${updates.join(", ")}`,
    ExpressionAttributeValues: values,
  }));

  return json({ success: true });
}

export async function cancelDate(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getAuth(event);
  const slotId = pathParam(event, "slotId");
  const body = parseBody<{ date: string }>(event);
  if (!body?.date) return error(400, "date required.");

  await ddb.send(new UpdateCommand({
    TableName: Tables.AvailabilitySlots,
    Key: { tutorId: caller.uid, slotId },
    UpdateExpression: "SET cancelledDates = list_append(if_not_exists(cancelledDates, :empty), :dateList)",
    ExpressionAttributeValues: { ":empty": [], ":dateList": [body.date] },
  }));

  return json({ success: true });
}

export async function uncancelDate(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getAuth(event);
  const slotId = pathParam(event, "slotId");
  const body = parseBody<{ date: string }>(event);
  if (!body?.date) return error(400, "date required.");

  // Read current cancelledDates, remove the date, write back
  const result = await ddb.send(new QueryCommand({
    TableName: Tables.AvailabilitySlots,
    KeyConditionExpression: "tutorId = :tid AND slotId = :sid",
    ExpressionAttributeValues: { ":tid": caller.uid, ":sid": slotId },
  }));

  const slot = result.Items?.[0];
  if (!slot) return error(404, "Slot not found.");

  const cancelledDates = ((slot.cancelledDates as string[]) ?? []).filter(d => d !== body.date);

  await ddb.send(new UpdateCommand({
    TableName: Tables.AvailabilitySlots,
    Key: { tutorId: caller.uid, slotId },
    UpdateExpression: "SET cancelledDates = :dates",
    ExpressionAttributeValues: { ":dates": cancelledDates },
  }));

  return json({ success: true });
}

export async function getTutorSlots(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const uid = pathParam(event, "uid");

  const result = await ddb.send(new QueryCommand({
    TableName: Tables.AvailabilitySlots,
    KeyConditionExpression: "tutorId = :uid",
    ExpressionAttributeValues: { ":uid": uid },
  }));

  return json({ slots: result.Items ?? [] });
}
