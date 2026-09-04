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

## How it is laid out

One canvas, one dock beneath it, no tabs. The dock shows the tray — themes,
a grid of cutouts, the palette — when nothing is selected, and the selected
piece's controls when something is: an **Edge** row, a **Material** row, and
a line of actions (front, back, flip, remove, back to the tray). Tap the
paper, press Escape, or tap *Tray* to get the tray back. Nothing is more than
one row deep.

With a mouse: drag to move, drag a corner to resize, drag the stem above the
top edge to rotate (Shift snaps to 15°), scroll to scale, Delete to remove,
arrows to nudge. With touch: drag to move, pinch to scale and rotate.

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

## Deploying

The app has two halves, and the halves have different needs.

**The client** (`dist/web`) is static and stands on its own. Everything a
maker does — the tray, the verbs, the replay, saving the still and the story —
runs on the device. Generated fragments are produced from their ids in the
browser, so the tray needs no server. What a static deploy cannot do is mint
permanent links, receive uploads for sharing, or serve link arrivals: those
are the server's job, and the export sheet says so in that case.

**The server** is one Node process with one SQLite file. It needs a host that
runs a long-lived process on a persistent disk — not a serverless function,
where the file would vanish between invocations and "permanent URL" would be
a lie.

| Host | What you get | How |
|---|---|---|
| **Vercel, Netlify, Pages** | Client only | `vercel.json` is included: build `npm run build`, output `dist/web`, SPA fallback. Deploy the repo as-is. |
| **Fly.io, Railway, Render** | Everything | `Dockerfile` is included. Mount a volume at `/app/data`; expose `8787`. |
| **A VM** | Everything | `npm ci && npm run build && npm start`, with `DATABASE_FILE` on a disk you keep. |

A Vercel deploy of the client with the server elsewhere is also fine: set
Vercel rewrites for `/api`, `/r`, `/u` and `/v` to the server's origin.

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
  theme, cold-arrival entry. The canvas is a clean white sheet; §8.1's
  substrate (stock, colour, texture) stays in the version record so a piece
  can carry one, but the editor does not offer it — a product decision taken
  after seeing it on a phone, where paper texture read as noise.

  One spec conflict, resolved rather than fudged: §8.1 asks for a canvas
  occupying ~65% of the viewport, and also for a fixed 4:5 frame with the
  controls persistent below rather than over it. On a 390 × 844 phone a
  full-bleed 4:5 frame is 56% of viewport height — 65% would need a canvas
  439px wide on a 390px screen. The frame and the non-modal controls are the
  two hard constraints, so the canvas is drawn as large as 4:5 permits and the
  number lands at 56%. `node tools/dev/measure.ts` reports it for any
  viewport.
- **M1 — Verbs.** Edge, material and palette are complete, run locally with
  no provider, and are what the editor offers. Cut (region mode), extend
  (local extrapolation) and relight (a measured light match) are implemented
  and render on any piece that carries them, but are not in the editor: they
  are the PRD's "after" tier, and without a model behind them they read as
  three more rows of controls rather than as the semantic tools §8.3
  describes. They come back when a provider does — see *Where the AI goes* in
  `docs/ARCHITECTURE.md`. Material offers three of its six looks for the same
  reason: newsprint, riso and photocopy read as distinct things at phone
  scale; halftone, textile and satellite read as variations.
- **M2 — Artifact.** Complete. Three exports, permanent URLs, OG cards, share
  sheet, and the replay.
- **M3 — Persistence.** Anonymous device save and the claim flow are complete.
  Reaction *notification* delivery needs a mail provider; the reactions
  themselves are recorded and counted.
