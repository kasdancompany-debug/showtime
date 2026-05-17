# Syncs NEXT_PUBLIC_* (and optional server) vars from .env.local to the linked Vercel project.
# Usage: .\scripts\sync-vercel-env.ps1 [-ProjectName showtime] [-Token $env:VERCEL_TOKEN]
param(
  [string]$ProjectName = "showtime",
  [string]$Token = $env:VERCEL_TOKEN
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$envFile = Join-Path $Root ".env.local"
if (-not (Test-Path $envFile)) {
  Write-Error "Missing .env.local at $envFile"
}

$vars = @{}
Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) { return }
  $idx = $line.IndexOf("=")
  if ($idx -lt 1) { return }
  $name = $line.Substring(0, $idx).Trim()
  $value = $line.Substring($idx + 1).Trim()
  if ($name -match "^NEXT_PUBLIC_" -or $name -match "^SUPABASE_") {
    $vars[$name] = $value
  }
}

if ($vars.Count -eq 0) {
  Write-Error "No NEXT_PUBLIC_* or SUPABASE_* entries found in .env.local"
}

$vercel = "npx"
$vercelArgs = @("--yes", "vercel@latest")
$globalArgs = @("--non-interactive")
if ($Token) { $globalArgs += @("-t", $Token) }

function Invoke-Vercel {
  param([string[]]$Args)
  & $vercel @vercelArgs @globalArgs @Args
  if ($LASTEXITCODE -ne 0) { throw "vercel failed: $($Args -join ' ')" }
}

Write-Host "Checking Vercel login..."
$who = & $vercel @vercelArgs @globalArgs whoami 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host $who
  Write-Error "Not logged in. Run: npx vercel login   OR set VERCEL_TOKEN from https://vercel.com/account/tokens"
}
Write-Host "Logged in as: $who"

if (-not (Test-Path ".vercel\project.json")) {
  Write-Host "Linking project '$ProjectName'..."
  Invoke-Vercel @("link", "-p", $ProjectName, "-y")
}

$targets = @("production", "preview", "development")
foreach ($name in $vars.Keys) {
  foreach ($target in $targets) {
    Write-Host "Setting $name ($target)..."
    Invoke-Vercel @(
      "env", "add", $name, $target,
      "--value", $vars[$name],
      "--yes", "--force", "--no-sensitive"
    )
  }
}

Write-Host "Redeploying production (picks up NEXT_PUBLIC_* at build time)..."
Invoke-Vercel @("deploy", "--prod", "--yes")

Write-Host "Done. Open https://showtime-7s49.vercel.app/screen and confirm badge says Live sync."
