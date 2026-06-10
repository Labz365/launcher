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

1. Bump `<Version>` in `src/AelixLauncher/AelixLauncher.csproj`.
2. `dotnet test` — all green.
3. `dotnet publish` (above).
4. *(TODO once cert exists)* sign `AelixLauncher.exe`.
5. `iscc installer\setup.iss`.
6. *(TODO once cert exists)* sign the setup EXE.
7. Upload the setup EXE to a GitHub Release on `Labz365/launcher`
   (keep the filename `AelixStudioLauncherSetup.exe`).
8. The website download button (`website-download-button.html`) points at
   `releases/latest/download/AelixStudioLauncherSetup.exe`, which always
   resolves to the newest release — no website change needed per release.
