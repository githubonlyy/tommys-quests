# Rebuild and redeploy Tommy's Quests to GitHub Pages
# Usage: .\deploy.ps1
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

Set-Location "$root\app"
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed" }

Set-Location "$root\app\dist"
New-Item -ItemType File .nojekyll -Force | Out-Null
git init | Out-Null
git checkout -b gh-pages 2>$null
git add -A
git commit -m "Deploy Tommy's Quests build" | Out-Null
git push --force "https://github.com/githubonlyy/tommys-quests.git" gh-pages
Set-Location $root
Remove-Item -Recurse -Force "$root\app\dist\.git" -Confirm:$false

Write-Host "Deployed: https://githubonlyy.github.io/tommys-quests/" -ForegroundColor Green
