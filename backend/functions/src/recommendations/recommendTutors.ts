// functions/src/recommendations/recommendTutors.ts
// Callable function: uses Claude AI to rank tutors based on reviews, availability, and search context

import * as functions from "firebase-functions/v2/https";
import { z } from "zod";
import { db } from "../lib/admin";
import { shouldEnforceAppCheck } from "../lib/runtime";
import { captureError } from "../lib/sentry";

const rankedTutorSchema = z.array(z.object({
  uid:    z.string(),
  score:  z.number().min(0).max(100),
  reason: z.string(),
}));

interface TutorInput {
  uid: string;
  name: string;
  grade: string;
  subjects: string[];
  bio?: string;
  avgRating: number;
  reviewCount: number;
  slotCount: number;          // number of available slots matching search
  hasRecurringSlots: boolean;
  hasDateSlots: boolean;
}

interface RankedTutor {
  uid: string;
  reason: string;   // short AI-generated explanation for the ranking
  score: number;     // 0-100 relevance score
}

export const recommendTutors = functions.onCall(
  { enforceAppCheck: shouldEnforceAppCheck, region: "us-central1" },
  async (request) => {
    if (!request.auth) {
      throw new functions.HttpsError("unauthenticated", "Sign in required.");
    }

    const { tutors, searchSubject, searchDate, searchDay } = request.data as {
      tutors: TutorInput[];
      searchSubject?: string;
      searchDate?: string;
      searchDay?: string;
    };

    if (!tutors || !Array.isArray(tutors) || tutors.length === 0) {
      return { ranked: [] };
    }

    // If only 1 tutor, no need to call AI
    if (tutors.length === 1) {
      return {
        ranked: [{
          uid: tutors[0].uid,
          reason: "Only available tutor matching your search.",
          score: 100,
        }],
      };
    }

    // ── Fetch recent reviews for each tutor (up to 10 each) ──────
    const reviewsByTutor: Record<string, { stars: number; text: string | null; authorName: string }[]> = {};

    await Promise.all(
      tutors.map(async (t) => {
        const snap = await db
          .collection("reviews")
          .where("targetId", "==", t.uid)
          .orderBy("createdAt", "desc")
          .limit(10)
          .get();

        reviewsByTutor[t.uid] = snap.docs.map((d) => {
          const data = d.data();
          return {
            stars: data.stars,
            text: data.text ?? null,
            authorName: data.authorName,
          };
        });
      })
    );

    // ── Build the Claude prompt ──────────────────────────────────
    const tutorSummaries = tutors.map((t) => {
      const reviews = reviewsByTutor[t.uid] ?? [];
      const reviewTexts = reviews
        .filter((r) => r.text)
        .map((r) => `  - ${r.stars}/5: "${r.text}"`)
        .join("\n");

      return [
        `TUTOR: ${t.name} (ID: ${t.uid})`,
        `  Grade: ${t.grade}`,
        `  Subjects: ${t.subjects.join(", ")}`,
        `  Bio: ${t.bio || "No bio provided"}`,
        `  Average Rating: ${t.avgRating.toFixed(1)}/5 (${t.reviewCount} reviews)`,
        `  Available Slots: ${t.slotCount} matching slot(s)`,
        `  Slot Types: ${[t.hasRecurringSlots ? "recurring weekly" : "", t.hasDateSlots ? "specific dates" : ""].filter(Boolean).join(", ") || "none"}`,
        reviews.length > 0 ? `  Recent Reviews:\n${reviewTexts || "    (ratings only, no text)"}` : "  No reviews yet.",
      ].join("\n");
    }).join("\n\n");

    const searchContext = [
      searchSubject ? `Subject requested: ${searchSubject}` : "No specific subject requested",
      searchDate ? `Date requested: ${searchDate}` : "",
      searchDay ? `Day requested: ${searchDay}` : "",
    ].filter(Boolean).join("\n");

    const prompt = `You are a recommendation engine for a school peer tutoring platform. A student is searching for a tutor. Rank the following tutors from best to worst match.

SEARCH CONTEXT:
${searchContext}

TUTORS:
${tutorSummaries}

RANKING CRITERIA (in order of importance):
1. Review quality: Look at the actual review text. Tutors praised for being patient, clear, helpful, or knowledgeable should rank higher. Negative feedback should lower ranking.
2. Rating & experience: Higher average ratings and more reviews indicate reliability. But a new tutor with no reviews should not be penalized too harshly.
3. Subject expertise: If a specific subject was searched, tutors who list it and have reviews mentioning it should rank higher.
4. Availability flexibility: More available slots and recurring availability shows commitment and gives the student more options.
5. Bio quality: Tutors with informative bios that mention their teaching approach or experience should rank slightly higher.

Return a JSON array (and nothing else) with this exact format:
[
  { "uid": "tutor-id", "score": 85, "reason": "Short 1-sentence explanation" },
  ...
]

Score should be 0-100. Order from highest to lowest score. The "reason" should be student-facing and encouraging (e.g., "Highly rated for clear explanations in math" not "Has good reviews").`;

    // ── Call Claude API ──────────────────────────────────────────
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      // Fallback: sort by rating if no API key configured
      console.warn("ANTHROPIC_API_KEY not set — falling back to rating-based sort");
      const ranked = tutors
        .sort((a, b) => {
          // Sort by weighted score: rating * log(reviewCount+1) + slotCount bonus
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
      return { ranked, aiPowered: false };
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

      if (!response.ok) {
        const errorText = await response.text();
        captureError(new Error(`Claude API returned ${response.status}: ${errorText}`), { function: "recommendTutors", action: "claudeApiCall" });
        console.error("Claude API error:", response.status, errorText);
        throw new Error(`Claude API returned ${response.status}`);
      }

      const result = await response.json() as { content?: { text?: string }[] };
      const text = result.content?.[0]?.text ?? "";

      // Parse the JSON from Claude's response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error("Could not parse JSON from Claude response");
      }

      const parsedRanked = rankedTutorSchema.safeParse(JSON.parse(jsonMatch[0]));
      if (!parsedRanked.success) {
        throw new Error("Claude response failed schema validation");
      }
      const ranked: RankedTutor[] = parsedRanked.data;

      // Validate: ensure all UIDs are from original list
      const validUids = new Set(tutors.map((t) => t.uid));
      const validRanked = ranked.filter((r) => validUids.has(r.uid));

      // Add any tutors Claude missed
      const rankedUids = new Set(validRanked.map((r) => r.uid));
      for (const t of tutors) {
        if (!rankedUids.has(t.uid)) {
          validRanked.push({
            uid: t.uid,
            score: 50,
            reason: "Available tutor matching your search.",
          });
        }
      }

      return { ranked: validRanked, aiPowered: true };
    } catch (err) {
      captureError(err, { function: "recommendTutors", action: "recommendationEngine" });
      console.error("Recommendation engine error:", err);

      // Fallback to simple rating sort
      const ranked = tutors
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
      return { ranked, aiPowered: false };
    }
  }
);
