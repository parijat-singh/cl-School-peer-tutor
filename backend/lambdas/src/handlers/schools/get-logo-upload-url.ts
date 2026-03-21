// POST /schools/{domain}/logo — Returns a presigned S3 PUT URL for logo upload.

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { getAuth } from "../../shared/auth.js";
import { json, error } from "../../shared/response.js";
import { pathParam } from "../../shared/router.js";
import { parseBody } from "../../shared/router.js";

const s3 = new S3Client({});
const BUCKET = process.env.LOGOS_BUCKET ?? "";

export async function getLogoUploadUrl(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getAuth(event);
  if (!["schooladmin", "superadmin"].includes(caller.role)) {
    return error(403, "Admins only.");
  }

  const domain = pathParam(event, "domain");
  if (caller.role === "schooladmin" && caller.schoolDomain !== domain) {
    return error(403, "Cross-school action denied.");
  }

  const body = parseBody<{ contentType: string }>(event);
  const contentType = body?.contentType ?? "image/png";

  if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(contentType)) {
    return error(400, "Invalid content type. Allowed: png, jpeg, webp, svg.");
  }

  const ext = contentType.split("/")[1].replace("svg+xml", "svg");
  const key = `schools/${domain}/logo.${ext}`;

  const url = await getSignedUrl(s3, new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  }), { expiresIn: 300 });

  return json({ uploadUrl: url, key });
}
