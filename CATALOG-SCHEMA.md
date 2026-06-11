# Catalog schema (`apps.json` / `coming-soon.json`)

> Merge this section into the repo README, or keep it as a standalone doc.

## `apps.json`

Array of app entries. **Existing fields are unchanged; new fields are optional**
— the launcher works with the current catalog as-is (no migration needed).

| Field | Required | Description |
|---|---|---|
| `id` | yes | Stable numeric ID. Used to track install state — never reuse IDs. |
| `name` | yes | Display name. Also used for the install folder name. |
| `tag` | no | Short label, e.g. `"Mobile App"`. |
| `platform` | no | `"Windows"` enables Install/Launch in the launcher; anything else (e.g. `"Android"`) is download-only. |
| `version` | yes | e.g. `"v1.0.0"`. The launcher compares this to the installed version to show **Update available**. |
| `description` | no | One or two sentences. |
| `downloadUrl` | yes* | HTTPS GitHub Releases URL under the `Labz365` org. Anything else is rejected by the launcher. (*omit for entries with no download) |
| `sha256` | no — **new** | Hex SHA-256 of the release asset. When present, the launcher verifies the download and refuses to install on mismatch. Strongly recommended for `.exe`/`.zip`. |
| `iconUrl` | no — **new** | HTTPS URL of an app icon (same allowlist rules). Placeholder shown when absent. |

### Example

```json
{
  "id": 2,
  "name": "AelixTool",
  "tag": "Desktop App",
  "platform": "Windows",
  "version": "v1.2.0",
  "description": "Example Windows app.",
  "downloadUrl": "https://github.com/Labz365/launcher/releases/download/aelixtool-v1.2.0/AelixTool.zip",
  "sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "iconUrl": "https://raw.githubusercontent.com/Labz365/launcher/main/icons/aelixtool.png"
}
```

### Computing `sha256` for a release asset

```powershell
(Get-FileHash .\AelixTool.zip -Algorithm SHA256).Hash.ToLower()
```

Add the value to `apps.json` **when you publish the release**. If the asset is
ever re-uploaded, recompute the hash or installs will (correctly) fail.

### Windows app packaging conventions

- `.zip` asset → extracted to `%LOCALAPPDATA%\AelixStudio\Apps\<Name>\app\`; the first `.exe` found becomes the Launch target.
- `.exe` asset → stored and launched directly.
- Anything else (`.apk`, …) → downloaded to the app folder, no Launch button.

## `minigames.json` (optional — new)

Curates the launcher's built-in **Arcade** from the repo. The games ship inside
the launcher (current keys: `snake`, `reflex`, `pong`, `pairs`); this file only overrides their
display metadata or disables them. If the file is missing or malformed the
launcher silently uses its built-in defaults — it is never an error.

| Field | Required | Description |
|---|---|---|
| `key` | yes | Built-in game id (`snake`, `reflex`, `pong`, `pairs`). Unknown keys are ignored. |
| `name`, `tag`, `description` | no | Display overrides. |
| `enabled` | no | `false` hides the game (default `true`). |
| `sourceUrl` | no | "Source" link override — must be on github.com (defaults to this repo). |

A ready-to-commit `minigames.json` is included in this repo.

## `coming-soon.json`

Array of `{ name, status, eta, description, notes }` — unchanged. Optional
`tag` / `platform` fields are also recognized. No download fields; the launcher
renders these entries without actions.
