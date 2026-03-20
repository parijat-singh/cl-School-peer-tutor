// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App";
import "./styles/global.css";

// ── Sentry error tracking ──────────────────────────────────────
// Initialised before React renders so uncaught errors during mount
// are captured. The DSN is a public key (safe to commit) — it only
// allows sending events, not reading them.
// Set VITE_SENTRY_DSN in .env / GitHub Secrets to enable.

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,           // "development" | "production"
    release: import.meta.env.VITE_GIT_SHA,       // set at build time in CD
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    // Performance: sample 20% of transactions in prod
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
    // Session Replay: capture 10% of sessions, 100% on error
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    // Don't send events in local dev unless DSN is explicitly set
    enabled: !!sentryDsn,
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
