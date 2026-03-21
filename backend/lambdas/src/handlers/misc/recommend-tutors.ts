// POST /recommendations/tutors
// Uses Claude AI to rank tutors based on reviews, availability, and search context.

import { z } from "zod";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from "aws-lambda";
import { ddb, Tables } from "../../shared/dynamo.js";
import { getAuth } from "../../shared/auth.js";
import { json } from "../../shared/response.js";
import { parseBody } from "../../shared/router.js";
import { captureError } from "../../shared/sentry.js";

const rankedTutorSchema = z.array(z.object({
  uid: z.string(),
  score: z.number().min(0).max(100),
  reason: z.string(),
}));

interface TutorInput {
  uid: string; name: string; grade: string; subjects: string[];
  bio?: string; avgRating: number; reviewCount: number;
  slotCount: number; hasRecurringSlots: boolean; hasDateSlots: boolean;
}

export async function recommendTutors(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  getAuth(event); // require auth

  const body = parseBody<{
    tutors: TutorInput[];
    searchSubject?: string; searchDate?: string; searchDay?: string;
  }>(event);

  const tutors = body?.tutors;
  if (!tutors || !Array.isArray(tutors) || tutors.length === 0) {
    return json({ ranked: [] });
  }

  if (tutors.length === 1) {
    return json({ ranked: [{ uid: tutors[0].uid, reason: "Only available tutor matching your search.", score: 100 }] });
  }

  // Fetch recent reviews for each tutor
  const reviewsByTutor: Record<string, { stars: number; text: string | null; authorName: string }[]> = {};
  await Promise.all(tutors.map(async (t) => {
    const result = await ddb.send(new QueryCommand({
      TableName: Tables.Reviews,
      IndexName: "targetId-createdAt-index",
      KeyConditionExpression: "targetId = :uid",
      ExpressionAttributeValues: { ":uid": t.uid },
      ScanIndexForward: false,
      Limit: 10,
    }));
    reviewsByTutor[t.uid] = (result.Items ?? []).map(d => ({
      stars: d.stars as number, text: (d.text as string) ?? null, authorName: d.authorName as string,
    }));
  }));

  // Build Claude prompt
  const tutorSummaries = tutors.map((t) => {
    const reviews = reviewsByTutor[t.uid] ?? [];
    const reviewTexts = reviews.filter(r => r.text).map(r => `  - ${r.stars}/5: "${r.text}"`).join("\n");
    return [
      `TUTOR: ${t.name} (ID: ${t.uid})`,
      `  Grade: ${t.grade}`, `  Subjects: ${t.subjects.join(", ")}`,
      `  Bio: ${t.bio || "No bio provided"}`,
      `  Average Rating: ${t.avgRating.toFixed(1)}/5 (${t.reviewCount} reviews)`,
      `  Available Slots: ${t.slotCount} matching slot(s)`,
      `  Slot Types: ${[t.hasRecurringSlots ? "recurring weekly" : "", t.hasDateSlots ? "specific dates" : ""].filter(Boolean).join(", ") || "none"}`,
      reviews.length > 0 ? `  Recent Reviews:\n${reviewTexts || "    (ratings only, no text)"}` : "  No reviews yet.",
    ].join("\n");
  }).join("\n\n");

  const searchContext = [
    body?.searchSubject ? `Subject requested: ${body.searchSubject}` : "No specific subject requested",
    body?.searchDate ? `Date requested: ${body.searchDate}` : "",
    body?.searchDay ? `Day requested: ${body.searchDay}` : "",
  ].filter(Boolean).join("\n");

  const prompt = `You are a recommendation engine for a school peer tutoring platform. A student is searching for a tutor. Rank the following tutors from best to worst match.

SEARCH CONTEXT:
${searchContext}

TUTORS:
${tutorSummaries}

RANKING CRITERIA (in order of importance):
1. Review quality: Look at the actual review text. Tutors praised for being patient, clear, helpful, or knowledgeable should rank higher.
2. Rating & experience: Higher average ratings and more reviews indicate reliability.
3. Subject expertise: If a specific subject was searched, tutors who list it should rank higher.
4. Availability flexibility: More available slots shows commitment.
5. Bio quality: Informative bios should rank slightly higher.

Return a JSON array (and nothing else) with this exact format:
[{ "uid": "tutor-id", "score": 85, "reason": "Short 1-sentence explanation" }]
Score 0-100. Order highest to lowest.`;

  const apiKey = process.env.ANTHROPIC_API_KEY;

  // Fallback sort function
  const fallbackSort = () => tutors
    .sort((a, b) => {
      const scoreA = a.avgRating * Math.log2(a.reviewCount + 2) + a.slotCount * 0.5;
      const scoreB = b.avgRating * Math.log2(b.reviewCount + 2) + b.slotCount * 0.5;
      return scoreB - scoreA;
    })
    .map((t, i) => ({
      uid: t.uid,
      score: Math.max(50, 100 - i * 10),
      reason: t.reviewCount > 0
        ? `Rated ${t.avgRating.toFixed(1)}/5 from ${t.reviewCount} review${t.reviewCount !== 1 ? "s" : ""}`
        : "New tutor — be their first student!",
    }));

  if (!apiKey) {
    return json({ ranked: fallbackSort(), aiPowered: false });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) throw new Error(`Claude API returned ${response.status}`);

    const result = await response.json() as { content?: { text?: string }[] };
    const text = result.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("Could not parse JSON from Claude response");

    const parsedRanked = rankedTutorSchema.safeParse(JSON.parse(jsonMatch[0]));
    if (!parsedRanked.success) throw new Error("Claude response failed schema validation");

    const validUids = new Set(tutors.map(t => t.uid));
    const validRanked = parsedRanked.data.filter(r => validUids.has(r.uid));
    const rankedUids = new Set(validRanked.map(r => r.uid));
    for (const t of tutors) {
      if (!rankedUids.has(t.uid)) {
        validRanked.push({ uid: t.uid, score: 50, reason: "Available tutor matching your search." });
      }
    }

    return json({ ranked: validRanked, aiPowered: true });
  } catch (err) {
    captureError(err, { function: "recommendTutors" });
    return json({ ranked: fallbackSort(), aiPowered: false });
  }
}
