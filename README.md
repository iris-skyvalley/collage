# collage

A mobile-web collage tool with a generated tray and AI manipulation verbs.
Craft output, no account required, and every piece exported as an addressable
version rather than a flat image.

The product specification is [`docs/PRD.md`](docs/PRD.md). This README covers
how to run it and how the code is arranged; [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
covers why it is arranged that way, and [`docs/DATA-CONTRACT.md`](docs/DATA-CONTRACT.md)
covers the one part that cannot be changed later.

## Run it

```bash
npm install          # also generates the static tray into web/public/fragments
npm run dev          # client on :5173, server on :8787
```

`npm run dev` runs the Vite client and the API server together; the client
proxies `/api`, `/r` and `/u` to the server. It creates a `.env` from
`.env.example` on first run — every value in it is already the default, so
there is nothing to fill in. For a production-shaped run:

```bash
npm run build && npm start   # server serves the built client on :8787
```

Requires Node 22.18 or newer: the server runs TypeScript directly and uses the
built-in `node:sqlite`, so there is no build step and no native dependency.

```bash
npm test         # 60 tests: the data contract, the verbs, the server
npm run typecheck
```

## What is here

```
shared/     the version contract, the tray's fragment generators, constants
web/        the client: renderer, verbs, editor, exports
server/     versions, renders, tray pools, short URLs, caps, abuse controls
tools/      the static-tray generator, and dev-only visual harnesses
test/       contract, verb and server tests
```

Three things carry most of the weight:

- **`shared/src/version.ts`** — the record every piece is saved as, with the
  PRD §9 non-negotiables enforced in code rather than by convention.
- **`web/src/render/renderer.ts`** — the single renderer used by the editor,
  the 1080 × 1350 piece, the 9:16 story and every replay frame.
- **`web/src/verbs/edge.ts`** — the highest-priority verb, and the one that
  decides whether the output looks made or generated.

## Configuration

Everything has a working default; nothing below is required to run.

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `8787` | Server port |
| `DATABASE_FILE` | `data/collage.db` | SQLite file; `:memory:` for tests |
| `TRAY_SIZE` | `60` | Fragments per themed tray (PRD targets 40–80) |
| `ARCHIVE_ENABLED` | unset | `1` adds open-access archive items to the tray |
| `NODE_ENV` | unset | `production` stops the claim route returning its own link |

## Milestone status

Against PRD §12:

- **M0 — Canvas.** Complete. Fixed 4:5, layer manipulation, a 60-asset tray per
  theme, cold-arrival entry.

  One spec conflict, resolved rather than fudged: §8.1 asks for a canvas
  occupying ~65% of the viewport, and also for a fixed 4:5 frame with the
  controls persistent below rather than over it. On a 390 × 844 phone a
  full-bleed 4:5 frame is 56% of viewport height — 65% would need a canvas
  439px wide on a 390px screen. The frame and the non-modal controls are the
  two hard constraints, so the canvas is drawn as large as 4:5 permits and the
  number lands at 56%. `node tools/dev/measure.ts` reports it for any
  viewport.
- **M1 — Verbs.** Edge, material and palette are complete and run locally with
  no provider. Cut ships its region mode; extend ships local extrapolation;
  relight ships a measured light match. All three carry a provider seam for a
  hosted model — see *Where the AI goes* in `docs/ARCHITECTURE.md`.
- **M2 — Artifact.** Complete. Three exports, permanent URLs, OG cards, share
  sheet, and the replay.
- **M3 — Persistence.** Anonymous device save and the claim flow are complete.
  Reaction *notification* delivery needs a mail provider; the reactions
  themselves are recorded and counted.
