# App Check & WAF (abuse mitigation)

## Firebase App Check (web)

1. **reCAPTCHA v3:** [Google reCAPTCHA admin](https://www.google.com/recaptcha/admin) → register site (v3) → copy **Site key**.
2. **Firebase Console** → **App Check** → your web app → register **reCAPTCHA v3** with that site key.
3. GitHub secret **`VITE_RECAPTCHA_SITE_KEY`** = same site key (public in client; protected by reCAPTCHA).
4. Deploy frontend (CD injects the key). App initializes App Check in production when the key is set.
5. After most users are on the new build: **App Check** → **APIs** → enable **enforcement** for **Cloud Functions** (start with “Monitor” mode, then enforce).

**Local dev:** App Check is skipped when `VITE_USE_EMULATORS=true`. For production-like local testing, use a [debug token](https://firebase.google.com/docs/app-check/web/debug-provider) (Firebase Console → App Check → Manage debug tokens).

## AWS WAF on CloudFront (optional)

Terraform variable **`enable_waf = true`** attaches a Web ACL with:

- **AWS Managed Rules — Core rule set** (common exploits).

**Cost:** WAF pricing per request + rule fees.

**Tuning:** If legitimate traffic is blocked, add WAF exclusions or scope-down statements in `infra/terraform/waf.tf` (or extend `main.tf`).

**Order of operations:** Apply Terraform with `enable_waf`; first deploy may take a few minutes for association to propagate.
