# Builds Aelix Notes, zips it, computes the SHA-256, writes it into apps.json,
# and prints the gh command to publish the release.
# Run from the repo root:  .\tools\release-notes.ps1

$ErrorActionPreference = "Stop"
$version = "v1.1.0"   # bump this (and apps.json "version" + downloadUrl tag) for updates

# 1. Publish (framework-dependent keeps the zip small; Notes needs .NET 8 Desktop Runtime,
#    which launcher users already have if the launcher was installed self-contained — to be
#    fully safe for everyone, switch --self-contained true at the cost of a bigger zip)
dotnet publish apps/AelixNotes -c Release -r win-x64 --self-contained true -o apps/AelixNotes/publish

# 2. Zip
$zip = "apps/AelixNotes/AelixNotes.zip"
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path "apps/AelixNotes/publish/*" -DestinationPath $zip

# 3. Hash
$hash = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
Write-Host "SHA-256: $hash"

# 4. Patch apps.json (sets sha256 on the Aelix Notes entry)
$apps = Get-Content apps.json -Raw | ConvertFrom-Json
$notes = $apps | Where-Object { $_.name -eq "Aelix Notes" }
$notes.sha256 = $hash
# -InputObject @(...) keeps the JSON an ARRAY even with one app — the launcher requires that
ConvertTo-Json -InputObject @($apps) -Depth 5 | Set-Content apps.json -Encoding UTF8
Write-Host "apps.json updated."

# 5. Next steps
Write-Host ""
Write-Host "Publish the release:" -ForegroundColor Yellow
Write-Host "  gh release create notes-$version `"$zip`" --repo Labz365/launcher --title `"Aelix Notes $version`" --notes `"Aelix Notes $version`""
Write-Host "Then push the catalog so the launcher sees it:" -ForegroundColor Yellow
Write-Host "  git add apps.json apps/ tools/; git commit -m `"Add Aelix Notes $version`"; git push"
