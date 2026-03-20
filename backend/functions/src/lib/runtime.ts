/**
 * Shared runtime toggles for Cloud Functions.
 *
 * In CI/emulators we often don't have real App Check tokens, so App Check
 * enforcement is disabled there but enabled in real environments.
 */

export const shouldEnforceAppCheck = process.env.FUNCTIONS_EMULATOR !== "true";

