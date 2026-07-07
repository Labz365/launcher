# Building the Aelix Studio Launcher

## Prerequisites

- Windows 10/11
- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- (Packaging) [Inno Setup 6](https://jrsoftware.org/isinfo.php)

## Build & run (dev)

```powershell
dotnet build AelixLauncher.sln
dotnet run --project src/AelixLauncher
```

## Tests

All security-sensitive logic (URL allowlist, redirect policy, SHA-256
verification, version comparison) lives in `AelixLauncher.Core` and is covered
by unit tests:

```powershell
dotnet test
```

## Aelix Canvas (optional GUI IDE module)

Canvas is **not bundled** with the launcher. The CANVAS tab offers it as a
download; users who don't want it pay zero bytes. Flow:

1. `canvas.json` (this repo, main branch) declares version + release-asset URL
   + **required** SHA-256.
2. `CanvasService` (Core) downloads through the same allowlist/redirect/hash
   pipeline as catalog apps, then extracts atomically to
   `%LOCALAPPDATA%\AelixStudio\Canvas`.
3. The tab loads it in WebView2 via a `canvas.aelix` virtual host.

### Publishing a Canvas release

```powershell
cd aelix-canvas
npm install       # first time
npm run build
Compress-Archive -Path dist\* -DestinationPath aelix-canvas-web.zip -Force
Get-FileHash aelix-canvas-web.zip -Algorithm SHA256
```

Then:
1. Create a GitHub release in `Labz365/launcher` tagged `canvas-vX.Y.Z` and
   attach `aelix-canvas-web.zip`.
2. Update `canvas.json` (version, url tag, sha256) and push to `main`.

To ship an update, repeat with a new tag + hash; users re-download from the tab
after clearing `%LOCALAPPDATA%\AelixStudio\Canvas` (auto-update UI is a TODO).

Note: the code editor (Monaco) loads from a CDN on first use, so Canvas needs
internet the first time it opens.

## Publish a release build

```powershell
dotnet publish src/AelixLauncher -c Release -r win-x64 --self-contained false -o publish
```

Output lands in `publish/`. Use `--self-contained true` if you don't want users
to need the .NET 8 Desktop Runtime (larger output).

## Package the installer (Inno Setup)

```powershell
# After publishing:
iscc installer\setup.iss
```

Produces `installer\Output\AelixStudioLauncherSetup.exe`.

Alternative: MSIX via the Windows Application Packaging Project, if you later
want Microsoft Store distribution. Inno Setup is the simpler default.

## Code signing — TODO (no certificate yet)

Unsigned binaries trigger SmartScreen warnings. When a certificate is
available, sign **both** the published `AelixLauncher.exe` and the installer:

```powershell
# PFX file certificate:
signtool sign /f aelix.pfx /p <password> /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 publish\AelixLauncher.exe
signtool sign /f aelix.pfx /p <password> /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 installer\Output\AelixStudioLauncherSetup.exe
```

Or with [Azure Trusted Signing](https://learn.microsoft.com/azure/trusted-signing/)
(cheaper than EV certs for individuals/small orgs, ~$10/month):

```powershell
signtool sign /v /fd SHA256 /tr http://timestamp.acs.microsoft.com /td SHA256 `
  /dlib Azure.CodeSigning.Dlib.dll /dmdf metadata.json <file>
```

Insert the signing step **between** `dotnet publish` and `iscc` for the app
binary, and after `iscc` for the installer. The Inno script also has a
commented `SignTool=` line ready to enable.

## Release checklist

### Automated (preferred) — GitHub Actions

Two workflows build and publish for you on a tag push (no local build needed):

**Launcher** (`.github/workflows/release-launcher.yml`) — Windows runner, builds
the WPF app + Inno Setup installer, publishes the release.

1. Bump `<Version>` in `src/AelixLauncher/AelixLauncher.csproj` **and**
   `#define MyAppVersion` in `installer/setup.iss`.
2. Commit to `main`, then:
   ```bash
   git tag launcher-v1.1.0
   git push origin launcher-v1.1.0
   ```
3. CI runs `dotnet test` → `dotnet publish` → `iscc` and creates the release with
   `AelixStudioLauncherSetup.exe` attached.
4. Update the download links in the **Aelix-Studio** site repo (`index.html` and
   `project-launcher.html`) to the new tag.

**Canvas** (`.github/workflows/release-canvas.yml`) — Linux runner, builds the web
app, zips it, publishes the release, and bumps `canvas.json` (version + url +
sha256) on `main` automatically.

1. Commit any `aelix-canvas/` changes to `main`, then:
   ```bash
   git tag canvas-v0.2.0
   git push origin canvas-v0.2.0
   ```
2. CI builds `aelix-canvas`, uploads `aelix-canvas-web.zip`, and commits the new
   `canvas.json` — the launcher's CANVAS tab picks it up on next open.

### Manual (fallback) — local build

1. Bump versions (csproj + setup.iss for launcher; none for canvas).
2. `dotnet test` — all green.
3. `dotnet publish src/AelixLauncher -c Release -r win-x64 --self-contained true -o publish`.
4. *(TODO once cert exists)* sign `AelixLauncher.exe`.
5. `iscc installer\setup.iss`.
6. *(TODO once cert exists)* sign the setup EXE.
7. Create a GitHub Release on `Labz365/launcher` tagged `launcher-vX.Y.Z` and upload
   the setup EXE (keep the filename `AelixStudioLauncherSetup.exe`).
8. Update the Aelix-Studio site links to the new tag.

> **Do NOT use `releases/latest/download/...` for the launcher.** This repo mixes
> Launcher, Notes, and Canvas releases, so `latest` resolves to whichever was
> published most recently and the link 404s. Always pin launcher links to the
> explicit `launcher-vX.Y.Z` tag.
