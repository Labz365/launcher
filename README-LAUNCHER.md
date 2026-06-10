# Aelix Studio Launcher

Windows desktop launcher (WPF / .NET 8) for the Aelix Studio app catalog.

On startup it fetches `apps.json` and `coming-soon.json` from this repo's
`main` branch, shows the catalog, and lets users install, update, and launch
apps with one click. Installed versions are tracked in
`%LOCALAPPDATA%\AelixStudio\installed.json` and an **Update available** badge
appears when the catalog version differs.

## Layout

```
src/AelixLauncher.Core/        Security-sensitive core (no UI deps, unit-tested)
  Security/UrlValidator.cs       HTTPS-only + host allowlist + Labz365 org check
  Security/HashVerifier.cs       SHA-256 helpers
  Services/DownloadService.cs    Streaming downloads, manual redirect validation,
                                 hash verification, isolated destination
  Services/CatalogService.cs     apps.json / coming-soon.json fetch + parse
  Services/InstallStateService.cs  installed.json (atomic writes)
  Services/InstallManager.cs     zip extraction / exe registration, uninstall
  Services/VersionComparer.cs    update detection
src/AelixLauncher/             WPF UI (MVVM, aelixstudio.com theme: #161616 / #F2EDE8 / #DDD0C4,
                               serif display type, animated hero, Epic-style sidebar)
src/AelixLauncher/Games/       Built-in Arcade minigames (Serpent, Reflex), curated by
                               optional minigames.json in this repo
src/AelixLauncher/Fonts/       Drop Cormorant / DM Sans / DM Mono TTFs here for the exact
                               website typography (see Fonts/README.md); falls back to system fonts
src/AelixLauncher.Core.Tests/  xUnit tests for the security core
installer/setup.iss            Inno Setup script
BUILD.md                       Build, package, code-signing (TODO) docs
CATALOG-SCHEMA.md              apps.json schema incl. new optional sha256/iconUrl
```

## Security model

1. **HTTPS only** — any non-HTTPS URL (initial or redirect) is rejected.
2. **Allowlist** — downloads must start from `github.com`/`raw.githubusercontent.com` under the `Labz365` org; redirects may only land on GitHub's release-asset CDN hosts. Auto-redirect is disabled and every hop is re-validated.
3. **Integrity** — if an app has a `sha256` in the catalog, the download is verified before install; mismatch ⇒ file deleted + clear error. Applies to updates too.
4. **Isolation** — downloads go to `%LOCALAPPDATA%\AelixStudio\Apps\<Name>\`, never a temp/downloads folder.
5. **No silent execution** — install and launch are explicit user clicks, with a confirmation dialog showing the source host and whether the file will be hash-verified.
