# Token & key rotation (Firebase CI, AWS deploy)

Rotate on a schedule (e.g. every 90 days) or immediately if exposed.

## Firebase `FIREBASE_TOKEN` (GitHub Actions)

1. Local machine: `firebase logout` then `firebase login:ci` (or use a dedicated bot Google account).
2. GitHub → repo → **Settings** → **Secrets** → update **`FIREBASE_TOKEN`**.
3. Old tokens stop working once replaced; no server-side “revoke list” for CI tokens — treat compromise as rotate + audit deploy history.

**Hardening (optional):** Use [Workload Identity Federation](https://firebase.google.com/docs/app-hosting/github-integration) patterns or a GCP service account with minimal roles (`Cloud Functions Developer`, `Firebase Rules Admin`) instead of a user CI token. Document your org’s WIF setup when adopted.

## AWS access keys (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`)

1. IAM → user `*-github-deploy` → **Security credentials** → **Create access key** (use case: CLI).
2. Update both secrets in GitHub.
3. **Deactivate then delete** the previous access key after a successful deploy.

**Hardening (optional):** [GitHub OIDC → AWS IAM role](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services). See **`infra/terraform/github-oidc.tf.example`** and switch CD to `aws-actions/configure-aws-credentials` with `role-to-assume`.

## GitHub Actions secrets (SMTP, API keys, calendar PEM)

- **Resend / SMTP:** Rotate in provider dashboard; update **`SMTP_PASS`** (and **`SMTP_USER`** if applicable).
- **Anthropic:** Rotate key; update **`ANTHROPIC_API_KEY`**.
- **Google Calendar SA key:** Create new key in GCP IAM → Service account → Keys; update **`GOOGLE_CALENDAR_PRIVATE_KEY`** and **`GOOGLE_CALENDAR_CLIENT_EMAIL`** if email changed; remove old key.
- **Sentry:** Project Settings → Client Keys; update **`SENTRY_DSN`** / **`VITE_SENTRY_DSN`** if you rotate the DSN.

After any change, trigger **CD** (or `workflow_dispatch`) so `write-functions-deploy-env.mjs` pushes new values to Cloud Functions.

## Calendar

| Item                         | Suggested cadence   |
|-----------------------------|---------------------|
| Firebase CI token           | 90 days or on hire/offboard |
| AWS deploy keys             | 90 days             |
| SMTP / third-party API keys | Per vendor policy   |
