# lol-arena-god-tracker-web

Vite + React SPA. Progress (1sts, mastery) lives in this browser's IndexedDB. Champion names, portraits, and OP.GG Arena tiers are fetched live. There is no app server and no Riot API key.

```bash
bun install
bun run dev
```

Upload a progress JSON to restore 1sts. Download JSON to back them up. Hosting the static build on Cloudflare Pages is enough. Progress will not follow you to another browser unless you import that JSON there.

If you still have an old `data/tracker.sqlite`, `bun run export-json` writes a file you can upload. Keep `data/*.json`, sqlite files, and `.env` out of git.

## Scripts

| Command               | What it does                               |
| --------------------- | ------------------------------------------ |
| `bun run dev`         | Vite dev server                            |
| `bun run build`       | Static files in `dist/`                    |
| `bun run preview`     | Serve `dist/` locally                      |
| `bun test`            | Unit tests                                 |
| `bun run export-json` | Convert a local sqlite file to backup JSON |

## Cloudflare Pages

- Framework preset: Vite
- Build command: `bun run build`
- Output directory: `dist`
- Install command: `bun install`
- Build environment variable: `BUN_VERSION=1.4.0` (Pages defaults to 1.2.15, which cannot read this repo's `bun.lock`)

The on-disk backup format id is still `arena-god-tracker-backup`, so older JSON exports keep working.
