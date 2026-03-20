# Security & ops checklist

Use this after initial production setup. Tick when done; revisit quarterly.

## Security

- [ ] **App Check enforcement** — Firebase Console → App Check → APIs → Cloud Functions: set to **Enforce** (after Monitor confirms tokens). [Details](app-check-and-waf.md)
- [ ] **Firestore PITR** — Run once: `./scripts/enable-firestore-pitr.sh <gcp-project-id>`. [Details](firestore-pitr-and-backups.md)
- [ ] **Token/key rotation** — Rotate `FIREBASE_TOKEN` and AWS deploy keys on schedule (e.g. 90 days). [Details](token-and-key-rotation.md)
- [ ] **AWS OIDC (optional)** — Remove long-lived AWS keys by using `infra/terraform/github-oidc.tf.example` and CD `role-to-assume`.
- [ ] **WAF** — If abuse is a concern: Terraform `enable_waf = true`, apply. [Details](app-check-and-waf.md)
- [ ] **Dependency and secret scans** — CI already runs Gitleaks, npm audit, CodeQL; ensure no suppressions hide real issues.

## Ops

- [ ] **S3 versioning** — Terraform `enable_s3_versioning = true` (default), `s3_version_lifecycle_days = 30`; apply for rollback + cost control.
- [ ] **GCP budget alert** — [Cloud Billing](https://console.cloud.google.com/billing/budgets) → create budget for the Firebase project → set alert threshold.
- [ ] **Cloud Monitoring** — Optional: [Alerting](https://console.cloud.google.com/monitoring/alerting) → create policy for Cloud Functions errors (e.g. error count > N).
- [ ] **Stale function env** — If you remove a GitHub secret, Cloud Run may keep the old value. To clear: Cloud Console → Cloud Run → service → Edit → Environment variables → remove the key, or `gcloud run services update SERVICE --region=us-central1 --remove-env-vars=VAR_NAME`.
- [ ] **Resend / CI emails** — CI and CD use `RESEND_API_KEY` and `RESEND_FROM_EMAIL`; same verified-from as CD.

## Quick commands

```bash
# PITR (once per project)
./scripts/enable-firestore-pitr.sh peertutor-prod

# List Cloud Run services (to remove env var)
gcloud run services list --region=us-central1 --project=peertutor-prod
gcloud run services update SERVICENAME --region=us-central1 --remove-env-vars=OLD_VAR
```
