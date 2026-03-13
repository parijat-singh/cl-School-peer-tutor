// functions/src/lib/googleMeet.ts
// Provisions Google Meet links via Google Calendar API
// Uses a service account with domain-wide delegation or a shared calendar

import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

function getAuth() {
  return new google.auth.JWT({
    email:      process.env.GOOGLE_CALENDAR_CLIENT_EMAIL,
    key:        (process.env.GOOGLE_CALENDAR_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    scopes:     SCOPES,
  });
}

// ── Provision a Meet link for a session ──────────────────────────

export interface MeetResult {
  meetLink:        string;
  calendarEventId: string;
}

export async function provisionMeetLink(params: {
  sessionId:     string;
  tutorEmail:    string;
  tuteeEmail:    string;
  subject:       string;
  scheduledDate: string; // ISO
  startTime:     string; // "HH:MM"
  endTime:       string;
  tutorName:     string;
  tuteeName:     string;
}): Promise<MeetResult> {
  const auth     = getAuth();
  const calendar = google.calendar({ version: "v3", auth });

  // Build ISO datetime strings
  const dateStr = params.scheduledDate.split("T")[0];
  const start   = `${dateStr}T${params.startTime}:00`;
  const end     = `${dateStr}T${params.endTime}:00`;

  // Exponential backoff retry (3 attempts)
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const event = await calendar.events.insert({
        calendarId:          process.env.GOOGLE_CALENDAR_ID ?? "primary",
        conferenceDataVersion: 1,
        sendUpdates:          "none", // We send our own emails via SendGrid
        requestBody: {
          summary: `PeerTutor: ${params.subject} — ${params.tutorName} & ${params.tuteeName}`,
          description: `Session ID: ${params.sessionId}`,
          start: { dateTime: start, timeZone: "America/New_York" },
          end:   { dateTime: end,   timeZone: "America/New_York" },
          attendees: [
            { email: params.tutorEmail },
            { email: params.tuteeEmail },
          ],
          conferenceData: {
            createRequest: {
              requestId:             `peertutor-${params.sessionId}`,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
          extendedProperties: {
            private: { peertutorSessionId: params.sessionId },
          },
        },
      });

      const meetLink = event.data.conferenceData?.entryPoints?.find(
        (e) => e.entryPointType === "video"
      )?.uri;

      if (!meetLink) throw new Error("No Meet link in calendar response");

      return {
        meetLink,
        calendarEventId: event.data.id!,
      };
    } catch (err) {
      lastError = err as Error;
      if (attempt < 2) {
        // Wait 2^attempt * 500ms before retry
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError ?? new Error("Failed to provision Meet link after 3 attempts");
}

// ── Delete a calendar event on cancellation ──────────────────────

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  const auth     = getAuth();
  const calendar = google.calendar({ version: "v3", auth });
  await calendar.events.delete({
    calendarId: process.env.GOOGLE_CALENDAR_ID ?? "primary",
    eventId,
    sendUpdates: "none",
  });
}
