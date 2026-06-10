# Brand fonts (optional)

The launcher theme matches aelixstudio.com, which uses these Google Fonts
(all SIL OFL licensed — free to embed):

| Font | Used for | Download |
|---|---|---|
| Cormorant | Display serif headings | https://fonts.google.com/specimen/Cormorant |
| DM Sans | Body text | https://fonts.google.com/specimen/DM+Sans |
| DM Mono | Eyebrows / meta text | https://fonts.google.com/specimen/DM+Mono |

Download each family, copy the `.ttf` files into this folder, and rebuild.
The theme picks them up automatically (`Fonts\**\*.ttf` is embedded as a
resource). Without them it falls back to Georgia / Segoe UI / Consolas, which
keeps the same editorial structure.

Keep each font's `OFL.txt` license alongside the TTFs when you add them.
