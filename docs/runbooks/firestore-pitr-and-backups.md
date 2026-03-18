# Firestore: PITR, backups, restore

## Point-in-time recovery (PITR)

PITR keeps a continuous backup window (7 days by default) so you can restore to a timestamp after mistakes or bad deploys.

**Cost:** Additional storage for PITR data; see [Firestore pricing](https://cloud.google.com/firestore/pricing).

### Enable (CLI)

```bash
chmod +x scripts/enable-firestore-pitr.sh
./scripts/enable-firestore-pitr.sh YOUR_GCP_PROJECT_ID
```

Or manually: **Google Cloud Console** → **Firestore** → select database **`(default)`** → **Point-in-time recovery** → Enable.

### Restore in place

See [Restore data with point-in-time recovery](https://cloud.google.com/firestore/docs/restore-in-place). Plan a maintenance window; restores replace current data in the database.

## Scheduled exports (optional)

For long-term archival (GCS), use [scheduled exports](https://cloud.google.com/firestore/docs/schedule-export) (Cloud Scheduler + Cloud Functions or gcloud). Not managed in this repo by default.

## App Check

Abuse mitigation is documented in [app-check-and-waf.md](./app-check-and-waf.md).
