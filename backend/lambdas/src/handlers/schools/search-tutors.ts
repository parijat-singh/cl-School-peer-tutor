// GET /schools/{domain}/tutors — Search tutors at a school (role=tutor OR role=both).

import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { json } from "../../shared/response.js";
import { pathParam } from "../../shared/router.js";

export async function searchTutors(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const domain = pathParam(event, "domain");

  // Query role=tutor and role=both from the schoolDomain-role GSI
  const [tutorResult, bothResult] = await Promise.all([
    ddb.send(new QueryCommand({
      TableName: Tables.Users,
      IndexName: "schoolDomain-role-index",
      KeyConditionExpression: "schoolDomain = :domain AND #role = :tutor",
      FilterExpression: "#status = :active",
      ExpressionAttributeNames: { "#role": "role", "#status": "status" },
      ExpressionAttributeValues: { ":domain": domain, ":tutor": "tutor", ":active": "active" },
    })),
    ddb.send(new QueryCommand({
      TableName: Tables.Users,
      IndexName: "schoolDomain-role-index",
      KeyConditionExpression: "schoolDomain = :domain AND #role = :both",
      FilterExpression: "#status = :active",
      ExpressionAttributeNames: { "#role": "role", "#status": "status" },
      ExpressionAttributeValues: { ":domain": domain, ":both": "both", ":active": "active" },
    })),
  ]);

  const tutors = [...(tutorResult.Items ?? []), ...(bothResult.Items ?? [])];

  return json({ tutors });
}
