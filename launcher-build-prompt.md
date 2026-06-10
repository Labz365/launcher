# Coding Agent Prompt: Aelix Studio Windows Launcher

Paste everything below into your coding agent.

---

## Context

I have a GitHub repo at `https://github.com/Labz365/launcher` that currently contains:

- `apps.json` — a catalog of Aelix Studio apps, each with `id`, `name`, `tag`, `platform`, `version`, `description`, `downloadUrl` (pointing to a GitHub Releases asset)
- `coming-soon.json` — a list of upcoming apps (same/similar shape, no downloadUrl yet)
- `README.md`

Example `apps.json` entry:
```json
{
  "id": 1,
  "name": "SFMe",
  "tag": "Mobile App",
  "platform": "Android",
  "version": "v1.0.0",
  "description": "A student budgeting app built in Flutter. Track spending, understand money, stay in control.",
  "downloadUrl": "https://github.com/labz365/launcher/releases/download/sfme-v1.0.0/SFMe.apk"
}
```

## Goal

Build a **Windows desktop launcher application** for "Aelix Studio" that:

1. On startup, fetches `apps.json` and `coming-soon.json` from the `Labz365/launcher` GitHub repo (raw content URLs on the `main` branch).
2. Displays a catalog UI listing each app with its name, tag, platform, version, and description.
3. For each available app, lets the user **download and install/update it** with one click, and **launch** it once installed.
4. Shows a separate "Coming Soon" section for entries from `coming-soon.json` (no download action).
5. Tracks installed app versions locally and shows an "Update available" indicator when the remote `version` differs from the locally installed version.

## Tech Stack

Use **C# / .NET (WPF)** for the launcher:
- Native Windows UI, good for a polished branded launcher
- Easy to package as a single installer (use Inno Setup or WiX/MSIX)
- Simple `HttpClient` calls for GitHub raw content + release asset downloads
- Local state stored in a small JSON file (e.g. `%LOCALAPPDATA%\AelixStudio\installed.json`)

If you think another stack is clearly better for this use case, propose it with a short rationale before proceeding — otherwise default to the above.

## Security Requirements

This launcher downloads and runs executables/installers, so security matters:

1. **HTTPS only** — all network calls must use HTTPS; reject any non-HTTPS `downloadUrl`.
2. **Domain allowlist** — only allow downloads from `github.com`/`raw.githubusercontent.com`/`objects.githubusercontent.com` under the `Labz365` org (or whatever org I confirm). Reject/flag anything else.
3. **Integrity verification** — extend the `apps.json` schema with an optional `sha256` field per app. If present, the launcher must verify the downloaded file's SHA-256 hash before allowing install/run, and refuse + show an error if it doesn't match. Document this schema addition in the repo's README.
4. **Isolated download/install location** — downloads go to a dedicated app-data folder (e.g. `%LOCALAPPDATA%\AelixStudio\Apps\<AppName>\`), never directly executed from a temp/browser-downloads folder.
5. **No silent execution** — the user must explicitly click "Install"/"Launch"; never auto-run a downloaded file without confirmation on first install.
6. **Code signing** — set up the launcher project so it can be code-signed (document the signing step in the build/release process), even if I don't have a certificate yet. Note this clearly as a TODO/config point.
7. **Update integrity** — the same domain allowlist + hash verification applies to update downloads, not just first installs.

## Deliverables

1. A new C#/.NET WPF solution in this repo (or a new repo if cleaner — ask me first) implementing the launcher.
2. A simple, clean UI: app list/grid with icons (placeholder ok), name, tag/platform badges, version, description, and an Install/Update/Launch button per app, plus a "Coming Soon" section.
3. Local install-state tracking (`installed.json`) with version comparison logic.
4. Download manager with progress indication, domain allowlist check, and optional SHA-256 verification.
5. A short `BUILD.md` explaining how to build, package (Inno Setup/WiX/MSIX), and where code-signing would be added.
6. A proposed update to `apps.json`'s schema (add `sha256`, maybe `iconUrl`) with a migration note — but don't break the existing format; make new fields optional.
7. Basic error handling: network failures, missing/malformed JSON, hash mismatches — all should show user-friendly messages, not crash.

## Open Questions to Resolve With Me Before/During Build

- Confirm whether the launcher's own source should live in `Labz365/launcher` (alongside the catalog files) or a separate repo.
- Confirm the org/domain allowlist (just `Labz365`, or broader?).
- Confirm whether I have (or want to set up) a code-signing certificate, or if that should remain a documented TODO.
- Confirm desired branding (app name shown, colors, logo) — placeholders are fine to start.

## Working Style

- Start by proposing the project structure and confirming the open questions above before writing a large amount of code.
- Keep the catalog-fetch and download/verification logic in clearly separated, testable modules — this is the security-sensitive core.
- Add a basic test for the SHA-256 verification and domain-allowlist logic.
