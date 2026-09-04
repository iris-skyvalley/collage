# Architecture

Decisions worth explaining, and the reasoning behind them. The specification is
in [`PRD.md`](PRD.md); this is about how the code answers it.

## One renderer, three outputs

[`web/src/render/renderer.ts`](../web/src/render/renderer.ts) draws the editor
canvas, the 1080 × 1350 piece, the 9:16 story and every frame of the replay. It
takes a composition and a size, and nothing else.

The alternative — an interactive renderer plus an export renderer — is the
usual arrangement and it is a trap. The two drift, and the drift lands in the
artifact people share rather than in the one they were looking at while they
made it. A single renderer costs some performance work (below) and removes an
entire class of "the export doesn't look like the canvas" bug.

The replay falls out of this almost for free: it is the same renderer with a
`reveal: { count, progress }` option, driven frame by frame into a
`MediaRecorder`. Nothing about the build sequence is captured or recorded
separately, because the version record already holds the layer order and the
placement timings.

## Keeping 60fps with a per-pixel verb pipeline

The verbs are per-pixel passes over a fragment's raster — an edge does a full
signed distance transform. Running that on a drag frame would be hopeless.

Three things keep it off the interaction path:

**Two tiers.** [`fragmentStore`](../web/src/render/fragmentStore.ts) holds the
raw raster and the processed raster separately. The raw one is available almost
immediately, and the renderer draws it while the pipeline runs — this is PRD
§10's "optimistic placeholder", and it means applying an edge never blanks the
piece.

**Verbs don't change during gestures.** Dragging, pinching and rotating change
only the transform, so the processed raster is reused untouched for the whole
gesture. The pipeline runs when a verb changes, which is a tap, not a frame.

**Raster sizes are bucketed** to 128px steps. A pinch scales the existing
raster and re-buckets on release, instead of re-running the pipeline at every
intermediate size.

**The pipeline runs in a Web Worker** (`web/src/verbs/worker.ts`), with at
most one job in flight per fragment and a newer request replacing the one
waiting — so a slider drag processes the latest value rather than every value,
and the main thread never stalls on a distance transform. While a new result
is computing the renderer keeps drawing the last good one for that layer, so
the canvas never flashes back to the untreated fragment between steps. The
verbs are pure functions on RGBA buffers, which is what makes this a
twenty-line change rather than a rewrite; the same functions run under
`node --test`.

## Edge, and why it uses a distance field

PRD §8.3 calls edge the highest-priority verb: "in the reference collage the
torn white edges are where the entire craft signal lives". It is also the one
most likely to look cheap if done the obvious way.

The obvious way is to perturb the alpha channel with noise. That gives a
speckled fringe — dust on the boundary — because each pixel is decided
independently. What a tear actually does is *move the boundary*.

So [`edge.ts`](../web/src/verbs/edge.ts) computes an exact Euclidean signed
distance field (Felzenszwalb & Huttenlocher) over the fragment's alpha, and
thresholds `sdf − noise × amplitude`. Displacing a distance field moves the
whole contour, so the silhouette stays one closed shape at any roughness.

Two details matter as much as the method:

- **The boundary only recedes.** Tearing removes material; it does not invent
  it. Noise is mapped to `[0, amplitude]` inward, never outward.
- **The pale core is painted, not grown.** A torn sheet exposes lighter fibre.
  That band is drawn into pixels the shape already owned, with a width that
  wanders on a slower noise than the boundary itself — a tear exposes more
  fibre where it pulled and less where it snapped.

Scissor uses linearly interpolated noise rather than smoothed, because the lack
of a smoothing curve is what produces straight segments meeting at corners,
which is what a scissor cut looks like.

## Where the AI goes

The PRD's verb set is "AI manipulation verbs", and this build ships without a
hosted model configured. That is a deliberate arrangement, not a gap papered
over:

| Verb | Ships as | With a provider |
|---|---|---|
| Edge | Complete. SDF displacement, no model needed or wanted | unchanged |
| Material | Complete. Screens, inks, weaves, terrain ramps | unchanged |
| Palette | Complete. Luminance mapped onto a ramp | unchanged |
| Cut | Region mode: tap a point, the connected run goes | Semantic mode: the phrase goes to a segmentation model, which returns a mask stored by reference |
| Extend | Extrapolates the fragment's own content outward through a noise-offset nearest-pixel sample | Outpainting |
| Relight | Measures the reference fragment's luminance gradient and imposes it | A model that understands the depth we do not have |

The seams are [`providers/generation.ts`](../server/src/providers/generation.ts)
and the verb params themselves. The local generator fills the same pools from
the same seeds a hosted model would, which means the whole path — pre-warm,
cache, serve, "more like this", the caps — is exercised and *measured* from day
one, rather than stubbed and discovered later. PRD §13 Q5 asks what a completed
piece costs; that question is only answerable if the cost path is real.

Every fragment is a deterministic function of its id, so a tray is cacheable,
pre-warmable, and regenerable byte-identically after any eviction. This is most
of what makes an anonymous generative product affordable at all.

## The two entry points

PRD §5 is emphatic that these want opposite things, so they are separate code
paths in [`app.ts`](../web/src/ui/app.ts) that converge immediately:

- **Cold arrival** gets an empty 4:5 canvas, a substrate already chosen and a
  full tray. No modal, no onboarding, no template gallery.
- **Link arrival** gets the sender's piece already rendered with every control
  live, and a persistent bar offering a reaction and a report.

Downstream they are identical. The only difference in what gets stored is
`parent_id`, which is why the two paths can share everything else — and why the
riff layer's write path is already in production traffic.

## Why SQLite, and why `node:sqlite`

One file, no service to stand up, and it ships with Node 22 — so there is no
native build step and no dependency that breaks on a runtime upgrade. Renders
and uploads are stored as blobs in the same file; at this scale that is
simpler than object storage and trivially replaceable behind the two routes
that read them.

The server runs TypeScript directly via Node's type stripping, so there is no
server build step either.

## Cost and abuse

PRD §10 treats both as first-build requirements, not later hardening.

**Cost.** Caps are enforced per session *and* per IP, and persisted in the
database — an in-memory limiter resets on every deploy, and a session-only
limiter is defeated by clearing storage. Tray pools are pre-warmed and
deterministic; fragments are served immutable and cache forever. The only route
that would cost money with a hosted provider is "more like this", and it is the
one that is capped.

**Abuse.** Uploads never reach a generative verb — enforced as the stronger,
simpler rule than "no uploaded faces", because deciding whether an upload
contains a face is exactly the judgement that cannot be made reliably. Every
shared URL has a report route; a report is recorded and logged. A takedown flag
stops a piece resolving anywhere, including its OG card.

Image classification is a seam
([`providers/moderation.ts`](../server/src/providers/moderation.ts)) and is
honest about being one: with nothing configured it passes images through and
logs that they were stored unchecked, so the gap shows up in the logs instead
of hiding behind a stub that always returns "safe". A classifier that throws
fails closed.

## Metrics

PRD §11's rule is that every metric is segmented by entry path. Rather than
relying on that being remembered at query time, `entry` is a column on the
events table and every event carries it — an event that arrives without one is
recorded as `cold` rather than null, so no query can silently blend the two.

Instrumentation is best-effort by design: batched, sent by `sendBeacon` where
available, and a malformed batch is dropped rather than rejected. It must never
be able to fail a session.
