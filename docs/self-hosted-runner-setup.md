# Self-Hosted GitHub Actions Runner — Setup Guide

The CD pipeline runs on **your machine** so that secrets never leave your
local filesystem. No credentials are stored in GitHub.

## How it works

```
git push → GitHub CI runs (GitHub servers, no secrets needed)
         → CI passes → GitHub triggers CD
         → Your machine picks up the job
         → Reads .env.production from local disk
         → Builds + deploys to S3 / CloudFront / Firebase
```

---

## One-time setup

### 1. Register the runner with GitHub

1. Go to: **GitHub → your repo → Settings → Actions → Runners → New self-hosted runner**
2. Select **Windows**
3. Follow the commands shown — they look like:

```powershell
# Download
mkdir actions-runner; cd actions-runner
Invoke-WebRequest -Uri https://github.com/actions/runner/releases/download/v2.x.x/actions-runner-win-x64-2.x.x.zip -OutFile actions-runner-win-x64.zip
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory("$PWD/actions-runner-win-x64.zip", "$PWD")

# Configure (use the token shown on the GitHub page — it expires after 1 hour)
./config.cmd --url https://github.com/parijat-singh/cl-School-peer-tutor --token <TOKEN_FROM_GITHUB>

# Install as a Windows service so it starts automatically on reboot
./svc.sh install
./svc.sh start
```

### 2. Install required tools on your machine

The runner needs these tools available in PATH:

| Tool | Install |
|------|---------|
| **Node 20** | https://nodejs.org |
| **AWS CLI v2** | https://aws.amazon.com/cli/ |
| **Firebase CLI** | `npm install -g firebase-tools@13` |
| **Git** | Already installed |

Verify:
```bash
node --version    # v20.x
aws --version     # aws-cli/2.x
firebase --version # 13.x
```

### 3. Configure AWS profile

The CD workflow uses the `schoolpeertutor` AWS profile:

```bash
aws configure --profile schoolpeertutor
# AWS Access Key ID:     <your key>
# AWS Secret Access Key: <your secret>
# Default region:        us-east-1
# Default output format: json
```

### 4. Log in to Firebase

```bash
firebase login
firebase use peertutor-prod
```

### 5. Verify .env.production exists

```
C:\Users\user\OneDrive\Documents\Coding\cl-School-peer-tutor\.env.production
```

This file is already in `.gitignore` — it will never be committed.

---

## Verifying the runner is online

Go to **GitHub → repo → Settings → Actions → Runners**

You should see your machine listed as **Idle** (green dot).

---

## Troubleshooting

**Runner shows as offline**
→ Open Services (Win+R → `services.msc`) → find `GitHub Actions Runner` → Start

**Deploy fails: `.env.production not found`**
→ The runner resolves paths relative to the workspace. Check that
  `.env.production` exists at the repo root on your machine.

**AWS auth fails**
→ Run `aws sts get-caller-identity --profile schoolpeertutor` to verify credentials.

**Firebase auth fails**
→ Run `firebase login` again to refresh the token.
