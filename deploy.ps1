# FALLBACK deploy only — normal deploys happen automatically via GitHub
# Actions on push to master (.github/workflows/ci.yml). Use this script only
# if Actions is down. Note: it deploys the local working tree as-is.
# Usage: .\deploy.ps1
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

Set-Location "$root\app"
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed" }

Set-Location "$root\app\dist"
New-Item -ItemType File .nojekyll -Force | Out-Null
# NOTE: no stderr redirects here — git writes status to stderr, and under
# ErrorActionPreference=Stop a redirected stderr line becomes a fatal error
git init --quiet
git checkout -B gh-pages --quiet
git add -A
git commit -m "Deploy Tommy's Quests build" --quiet
git push --force --quiet "https://github.com/githubonlyy/tommys-quests.git" gh-pages
Set-Location $root
Remove-Item -Recurse -Force "$root\app\dist\.git" -Confirm:$false

Write-Host "Deployed: https://githubonlyy.github.io/tommys-quests/" -ForegroundColor Green
