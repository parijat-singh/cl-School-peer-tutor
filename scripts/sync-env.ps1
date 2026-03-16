# scripts/sync-env.ps1 — Keep .env.example in sync with .env (Windows)
# ─────────────────────────────────────────────────────────────────
# Reads .env, strips secret values, preserves comments and structure,
# and writes .env.example so new developers know which vars to set.
#
# Usage:
#   powershell -File scripts\sync-env.ps1
# ─────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$EnvFile = Join-Path $RootDir ".env"
$ExampleFile = Join-Path $RootDir ".env.example"

# ── Preflight ────────────────────────────────────────────────────

if (-not (Test-Path $EnvFile)) {
    Write-Host "[sync-env] No .env found - nothing to sync."
    exit 0
}

# ── Helper: extract variable names from a file ───────────────────

function Get-EnvKeys($FilePath) {
    $keys = @()
    if (-not (Test-Path $FilePath)) { return $keys }
    foreach ($line in Get-Content $FilePath) {
        $trimmed = $line.Trim()
        if ($trimmed -eq "" -or $trimmed.StartsWith("#")) { continue }
        if ($trimmed -match "^([A-Za-z_][A-Za-z0-9_]*)=") {
            $keys += $Matches[1]
        }
    }
    return $keys
}

# ── Collect keys ─────────────────────────────────────────────────

$envKeys = Get-EnvKeys $EnvFile
$exampleKeys = Get-EnvKeys $ExampleFile

# ── Find missing keys ───────────────────────────────────────────

$missing = @()
foreach ($key in $envKeys) {
    if ($exampleKeys -notcontains $key) {
        $missing += $key
    }
}

# ── Find removed keys ───────────────────────────────────────────

$removed = @()
foreach ($key in $exampleKeys) {
    if ($envKeys -notcontains $key) {
        $removed += $key
    }
}

$changes = $false

# ── Append missing keys ─────────────────────────────────────────

if ($missing.Count -gt 0) {
    $changes = $true
    $date = Get-Date -Format "yyyy-MM-dd"
    Add-Content $ExampleFile ""
    Add-Content $ExampleFile "# -- Added by sync-env $date ------------------------------------------"
    foreach ($key in $missing) {
        Write-Host "[sync-env] + Adding:  $key"
        Add-Content $ExampleFile "$key="
    }
}

# ── Warn about removed keys ─────────────────────────────────────

if ($removed.Count -gt 0) {
    $changes = $true
    Write-Host ""
    Write-Host "[sync-env] WARNING: These keys are in .env.example but NOT in .env:" -ForegroundColor Yellow
    foreach ($key in $removed) {
        Write-Host "           - $key" -ForegroundColor Yellow
    }
    Write-Host "           Remove them manually from .env.example if no longer needed."
}

# ── Sanitize values — strip secrets from .env.example ────────────

$safeKeys = @(
    "FIREBASE_AUTH_DOMAIN",
    "FIREBASE_STORAGE_BUCKET",
    "SENDGRID_FROM_EMAIL",
    "SENDGRID_FROM_NAME",
    "GOOGLE_CALENDAR_ID",
    "SUPER_ADMIN_EMAIL",
    "DOMAIN",
    "NODE_ENV"
)

$safePlaceholders = @{
    "FIREBASE_AUTH_DOMAIN"    = "your-project.firebaseapp.com"
    "FIREBASE_STORAGE_BUCKET" = "your-project.appspot.com"
    "SENDGRID_FROM_EMAIL"    = "noreply@yourdomain.com"
    "SENDGRID_FROM_NAME"     = "PeerTutor"
    "GOOGLE_CALENDAR_ID"     = "primary"
    "SUPER_ADMIN_EMAIL"      = "admin@yourdomain.com"
    "DOMAIN"                 = "yourdomain.com"
    "NODE_ENV"               = "development"
}

if (Test-Path $ExampleFile) {
    $newLines = @()
    foreach ($line in Get-Content $ExampleFile) {
        $trimmed = $line.Trim()

        # Pass through comments and blank lines
        if ($trimmed -eq "" -or $trimmed.StartsWith("#")) {
            $newLines += $line
            continue
        }

        if ($trimmed -match "^([A-Za-z_][A-Za-z0-9_]*)=(.*)$") {
            $key = $Matches[1]
            if ($safeKeys -contains $key) {
                $placeholder = $safePlaceholders[$key]
                if (-not $placeholder) { $placeholder = "" }
                $newLines += "$key=$placeholder"
            } else {
                # Secret key — always blank
                $newLines += "$key="
            }
        } else {
            $newLines += $line
        }
    }
    Set-Content $ExampleFile -Value ($newLines -join "`n") -NoNewline
    Add-Content $ExampleFile ""
}

# ── Summary ──────────────────────────────────────────────────────

if ($changes) {
    Write-Host ""
    Write-Host "[sync-env] .env.example updated - review and commit the changes." -ForegroundColor Green
} else {
    Write-Host "[sync-env] .env.example is already in sync with .env." -ForegroundColor Green
}
