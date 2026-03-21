// Lambda entry point for pt-scheduled: EventBridge scheduled events.
// Dispatches based on the "action" field in the EventBridge JSON input.

import { sendSessionReminders } from "./send-session-reminders.js";
import { triggerRatingPrompts } from "./trigger-rating-prompts.js";
import { updateSchoolStats } from "./update-school-stats.js";
import { purgeOldSessions } from "./purge-old-sessions.js";

interface ScheduledEvent {
  action: string;
}

const actions: Record<string, () => Promise<void>> = {
  sendSessionReminders,
  triggerRatingPrompts,
  updateSchoolStats,
  purgeOldSessions,
};

export const handler = async (event: ScheduledEvent): Promise<void> => {
  const action = event.action;
  const fn = actions[action];

  if (!fn) {
    console.error(`Unknown scheduled action: ${action}`);
    return;
  }

  console.log(`Running scheduled action: ${action}`);
  await fn();
  console.log(`Completed scheduled action: ${action}`);
};
