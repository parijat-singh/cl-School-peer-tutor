# scripts/setup.ps1
# PeerTutor — Windows Setup Script
# Run from project root: .\scripts\setup.ps1

Write-Host "PeerTutor Setup" -ForegroundColor Cyan
Write-Host "===============" -ForegroundColor Cyan

# Check Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Docker not found. Install Docker Desktop: https://www.docker.com/products/docker-desktop"
    exit 1
}

# Check .env
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created .env from .env.example" -ForegroundColor Yellow
    Write-Host "IMPORTANT: Edit .env with your Firebase project values before continuing." -ForegroundColor Red
    Write-Host "Press any key to open .env in Notepad, or Ctrl+C to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    notepad .env
    Write-Host "Press any key once you have saved .env..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

Write-Host ""
Write-Host "Building and starting PeerTutor..." -ForegroundColor Green
docker-compose up --build

Write-Host ""
Write-Host "Services running:" -ForegroundColor Green
Write-Host "  Frontend:           http://localhost:5173"
Write-Host "  Firebase Emulators: http://localhost:4000"
Write-Host "  Nginx proxy:        http://localhost:80"
