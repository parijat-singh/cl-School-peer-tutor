# Part 1 steps 2 & 3: Terraform init, plan, apply, then output
# Run from repo root: .\infra\terraform\run-init-apply.ps1
# Requires: Terraform and AWS CLI installed and AWS credentials configured

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "Step 2a: terraform init" -ForegroundColor Cyan
terraform init
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`nStep 2b: terraform plan" -ForegroundColor Cyan
terraform plan -out=tfplan
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`nStep 2c: terraform apply (auto-approved)" -ForegroundColor Cyan
terraform apply -auto-approve tfplan
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`nStep 3: terraform output (save these for GitHub Secrets)" -ForegroundColor Cyan
terraform output

Write-Host "`nDone. Add the values above to GitHub Secrets (see docs/production-setup-guide.md)." -ForegroundColor Green
