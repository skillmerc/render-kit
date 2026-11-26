# render-kit

Turns a short JSON spec into a motion-graphics MP4 on GitHub Actions. Made by SKILLMERC.

What it does:

- Text that slides and fades in, line by line
- Slow zoom (Ken Burns) on photos and on the plain backgrounds
- Captions in a bar near the bottom
- Transitions between scenes (fade, slide, wipe, smooth, circle)
- 16:9 (1920x1080), 9:16 (1080x1920) or 1:1 (1080x1080), 30 fps, H.264 with a silent AAC track

## Run it

Actions tab, "render", "Run workflow". Paste a spec into `spec` and pick a `name`. The MP4 is attached to the run as an artifact for one day. The Probe step prints its length, size and resolution.

Text goes in the dispatch input only. Nothing from a spec is committed to this repo.

## Spec

```json
{
  "aspect": "16:9",
  "music": "none",
  "palette": { "bg": "#0d0d10", "fg": "#f4f4f5", "muted": "#a1a1aa", "accent": "#ff6a48" },
  "transitionSeconds": 0.6,
  "scenes": [
    { "kicker": "New", "lines": ["A headline", "A supporting line"], "duration": 4, "caption": "Optional caption" },
    { "lines": ["Over a photo"], "image": "https://example.com/photo.jpg", "duration": 4, "transition": "slideleft" }
  ]
}
```

| Field | Meaning |
|---|---|
| `aspect` | `16:9`, `9:16` or `1:1` |
| `music` | `none` only |
| `palette` | Colours for every scene; a scene can set its own `palette` |
| `scenes[].lines` | Up to 6 lines. The first is the headline, the rest are body text |
| `scenes[].kicker` | Small label above the headline |
| `scenes[].duration` | 1.5 to 30 seconds. Total length up to 180 seconds |
| `scenes[].image` | An https image to use as the background, with a slow zoom and a dark shade for legible text. Use only images you have the rights to |
| `scenes[].caption` | Caption text in a bar near the bottom |
| `scenes[].transition` | How this scene comes in: `fade`, `dissolve`, `slideleft`, `slideright`, `slideup`, `slidedown`, `wipeleft`, `wiperight`, `wipeup`, `wipedown`, `smoothleft`, `smoothright`, `smoothup`, `smoothdown`, `circleopen`, `circleclose` |
| `scenes[].kenBurns` | `in` or `out` (default alternates) |
| `scenes[].align` | `left` (default) or `center` |

`examples/promo-16x9.json` is a 20 second example.

## Fonts

Geist and Geist Mono, SIL Open Font License 1.1 (`fonts/LICENSE-Geist.txt`).
