# Collage — PRD v0.2
**Working title. Sky Valley · September 2026**
*A mobile-web collage tool in the Polyvore mould: a tray of fashion cutouts, a white canvas, no account required, and every piece exported as an addressable version rather than a flat image.*

> **v0.2 — what changed from v0.1, and why.** The first build was made
> against v0.1 and then used. Three things did not survive contact: the
> archive-sourced tray (botanical plates, maps, type specimens) made the
> product read as a museum-department exercise rather than something you'd
> make about a person; the paper substrate read as noise on a phone; and the
> six-verb editor was three menus deep. v0.2 corrects the document to the
> product that exists: Polyvore's model — a tray of fashion items, a clean
> white canvas, one edge control — with the data contract and the artifact
> unchanged. Sections that changed are marked *(v0.2)*.
---
## 1. Summary
A single-page web app. Two entry points, deliberately different: people who come to the site get an empty canvas and a loaded tray; people who arrive on someone's link get that person's finished piece with the controls live. No signup, no install.
The tray is Polyvore's: fashion items — tops, bottoms, dresses, outerwear, shoes, bags, accessories, beauty — as cutouts on white, plus the maker's own photos, cut out on import. *(v0.2)* It is generated rather than retailer-fed: authored fashion flats from seeds, not product feeds, so there are no rights, no dead SKUs and no merchant. The AI does the mechanical work — cutting out a photo, re-cutting an edge — and none of the compositional work. Output is 4:5, plus a 9:16 story variant and a process replay.
Riffing mechanics are out of scope; they're being built separately. This PRD's obligation to that work is a **data contract**: every piece is persisted as a parameterised version with a parent field, so the riff layer can attach without a rewrite.
---
## 2. Goals
1. A non-creator can produce a collage they'd willingly send to a specific person, in under three minutes, on a phone, without an account.
2. Every output carries a reason to be posted beyond the image itself.
3. Every output is structurally forkable, whether or not forking is shipped.
## 3. Non-goals
- Riff/remix UI, lineage display, fork counts, attribution surfaces
- Discovery feed, following, profiles
- Shoppable items or affiliate integration (explicitly rejected — generated tray chosen)
- Desktop authoring tools for recipes or trays
- Discord, native apps
- Infinite canvas, arbitrary aspect ratios, layer count freedom
## 4. The hypothesis
Not "will people make collages" — Polyvore answered that at 87,000 sets a day. The open questions this build tests:
1. Does removing the *mechanical* labour preserve the craft draw, or destroy the reason to post? Polyvore's clipper removed physical cutting and the culture survived, because the labour that signalled effort was compositional. AI removing more is the same bet, one step further.
2. Can a constrained format produce outputs a non-creator considers sendable? Constraint, not simplification, is the differentiator against Canva.
---
## 5. Principles
**Constrain, don't simplify.** "Easier than Canva" is not a moat and Canva can ship it in a sprint. One aspect ratio, one tray per session, a bounded verb set. Comparable outputs are what make a feed legible later and a riff obvious at all.
**Never a blank tray — but a blank canvas is fine for the people who came looking.** The two tiers want opposite things and the entry points must differ accordingly. Someone who navigated here self-selected as a maker: give them the empty frame and the full tray, and don't put a demo in the way. Someone who arrived on a link was conscripted and didn't ask to create: give them the sender's finished piece with the knobs live, where the first act is a nudge rather than a first mark. What neither tier ever gets is nothing to work with — Polyvore's canvas was empty and it ran at 87,000 sets a day, because the item library was already there.
**Identity after value.** Nothing that blocks making or sending. The account exists to tell you who reacted.
**Effort must stay legible.** "Made with knife and glue" is the entire caption on the reference post and it's why the post travelled. "Made with a slider" is not a claim anyone posts. If we remove the visible labour we have to reconstruct the signal, which is what the process replay is for.
---
## 6. The artifact
The primary deliverable, specified first because everything else serves it.
### 6.1 Three exports from one composition
| Export | Spec | Purpose |
|---|---|---|
| **Piece** | 1080 × 1350 (4:5), PNG/JPEG | Feed, DM, Pinterest |
| **Story** | 1080 × 1920 (9:16), background outpainted from the composition | Stories, no recomposition needed |
| **Replay** | 9:16 MP4, 4–8s, layer-by-layer build | The effort signal; the reason to post |
4:5 is the recommended Instagram feed ratio and takes ~25% more vertical space than square; it also survives the 3:4 grid crop with a small trim rather than letterboxing, and approximates Pinterest's 2:3. Not user-selectable.
The story export uses outpainting rather than a taller canvas, because a 9:16 canvas is a bad collage frame — too narrow for the layering that is the entire craft.
### 6.2 The replay is a feature, not an export option
Generated by default, offered before the still. It's watchable, it proves the composition was authored rather than generated, and it's the same layer-order data we persist anyway. Speedpaint already works as a format. Treat this as load-bearing: it is the answer to "why would anyone post this."
### 6.3 Share behaviour
- Every piece gets a permanent short URL on creation, before any share action
- OG/Twitter card renders the piece at the correct ratio with a static preview
- The URL opens the piece as a **version** — parameters and layer stack, viewable, not a flat image
- Native share sheet with image + link; copy-link fallback
- No watermark on the still. Small mark on the replay's final frame only
---
## 7. Core flow
### 7.1 Cold arrival (homepage, direct, search, social)
1. **Land.** Empty 4:5 canvas, substrate pre-selected, themed tray already populated below it. No modal, no onboarding, no template gallery. Theme switcher present but not required.
2. **Place something.** First interaction is dragging a fragment onto the canvas.
3. **Compose.** Add, remove, reorder, transform. Apply verbs.
### 7.2 Link arrival (someone sent you a piece)
1. **Land on their piece.** Rendered, attributed to the sender, controls live and visibly interactive. Not a viewer with an edit button — the knobs are already there.
2. **Change something.** First interaction is a nudge to what already exists. Target: under 5 seconds from load.
3. **Compose.** As above, from the piece's own tray and theme.
### 7.3 Both paths converge
4. **Export.** Replay offered first, then piece and story. Share sheet.
5. **Claim (optional).** After sending: "sign in to see who reacted." Never before.
Link arrival writes `parent_id`; cold arrival writes null. That is the only difference in what gets stored, and it is why the two paths can share everything downstream.
Auto-save to device-scoped anonymous session from the first action. Nothing is ever lost, and "claim this" acts on an object that already exists.
---
## 8. Features
### 8.1 Canvas *(v0.2)*
- Fixed 4:5, 1080 × 1350 render target
- As large as 4:5 permits, full-bleed on a phone (≈56% of viewport height on a 390 × 844 screen — a fixed 4:5 frame cannot reach 65% without cropping or covering it); tray and controls persistent below, no modal editing
- Layer cap: 20 fragments (hard). Forces composition, keeps replay watchable, bounds render cost
- A clean white sheet. There is no paper stock, colour or texture control — the v0.1 substrate read as noise on a phone and competed with the pieces. The version record still carries a substrate so a piece *can* have one; the editor does not offer it.
### 8.2 Tray *(v0.2)*
Polyvore's tray, without Polyvore's retailers. Two sources, both free of gatekeepers:
- **Generated fashion flats.** Prompt-free. Tops, bottoms, dresses, outerwear, shoes, bags, accessories, beauty — authored garment and item illustrations produced from seeds, in one wardrobe palette, with textile patterns. Every item is reproducible from its id, on the server or in the browser, so the tray is cacheable, pre-warmable and works offline.
- **The maker's own photos.** The photo picker is the Clipper: an image comes in with its background cut away and lands as a piece. This is how real products, and real people's things, enter a piece.
Rules:
- The landing tray is *All* — every family mixed, the way a real tray is. Categories (Polyvore's eight) filter it. Not a search box.
- Target 40–80 items visible. One "more like this" action per item, generating variants of a chosen fragment
- The open-access archive adapter from v0.1 remains in the code, off by default. It is no longer the product.
### 8.3 Verbs *(v0.2)*
The editor offers two. Polyvore offered none of this beyond a few photo filters, and the v0.1 set of six was three menus deep; what remains is the one verb with a craft argument, and the one that ties a piece together.
| Verb | Where | What it does |
|---|---|---|
| **Edge** | On the selected piece | Clean / cut / torn / scissor / deckle / burnt, with a roughness slider |
| **Palette** | Under the tray | Apply a palette across all pieces at once |

**Edge is the highest-priority verb.** The torn white edge is where the craft signal lives, and no tool ships edge treatment as a first-class parameter. If one thing differentiates the output visually, it's this.

Four more are implemented, stored as parameters, and render on any piece that carries them, but are not offered in the editor: **Material** (newsprint, riso, halftone, photocopy, textile, satellite), **Cut** (region and semantic), **Extend** and **Relight**. Material is a style rather than a signal. The other three are the v0.1 "after" tier and, without a model behind them, read as more rows of controls rather than as the semantic tools they were specified as. They return when a provider does.
### 8.4 Accounts
- Anonymous: create, export, share, and persist to device — permanently, not first-use only
- Signed in: reaction notifications, cross-device library
- Auth: email link or OAuth. No password, no profile setup, no onboarding
---
## 9. Data model — the contract with the riff layer
Every piece persists as a version object, not an image. This is the only requirement in this PRD driven by work outside it, and it must be right in the first build because retrofitting it means a migration of everything users have made.
```
Version
  id
  parent_id          nullable — always written, never read in v1
  root_id            nullable
  created_by         nullable (anonymous session id or user id)
  substrate          { stock, colour, texture }
  palette
  layers[]           ordered
    fragment_ref     generated-asset id | archive id | upload id
    transform        { x, y, scale, rotation, z }
    verbs[]          { verb, params }
  render_hashes      { piece, story, replay }
  created_at
```
Non-negotiables:
- `parent_id` and `root_id` exist and are written from day one, even though nothing reads them
- Fragments are referenced, never flattened into the saved state
- Verbs are stored as parameters, never baked into pixels
- Layer order and timing are retained (they are the replay and the future diff)
- A version is reconstructable and re-renderable from its record alone
If those hold, the riff layer attaches by reading versions and writing children. If any fails, forking is impossible without a rebuild.
---
## 10. Non-functional
**Cost.** Anonymous plus generative means every session spends money with no identity to bill or throttle. Required in v1: per-session and per-IP generation caps, device fingerprinting, aggressive caching of generated tray assets (trays are themed and finite — cache hit rate should be high), pre-warmed tray pools rather than on-demand generation per user.
**Abuse.** Anonymous AI image generation is the exact exposure that ended Shapes on Discord. In the first build, not later: input and output content filtering, no likeness generation of real people, no user-uploaded faces into generative verbs, abuse reporting on every shared URL, takedown path. Treat platform-policy-shaped constraints as design inputs even though we're on our own domain, because our distribution runs through platforms that have them.
**Performance.** Interactive on a mid-range phone. Canvas manipulation at 60fps. Verb latency under 3s with an optimistic placeholder. Replay renders client-side where possible.
**Rights.** Generated and user-supplied only. No retailer imagery, no affiliate feeds. This keeps Polyvore's editor and rejects Polyvore's supply chain: no merchant approvals, no dead SKUs, no licence argument, and no revenue. *(v0.2: the open-access archive is no longer a source.)*
---
## 11. Metrics
Primary, in order:
1. **Completion rate** — of sessions that touch the canvas, how many export
2. **Send rate** — of exports, how many are shared or the link is opened by someone else
3. **Replay share share** — of shares, what fraction include the replay. Directly tests whether the effort signal works
4. **Time to first change** — proxy for whether the no-blank-canvas entry is doing its job
5. **Recipient creation rate** — of people arriving via a shared link, how many make one. Not a riff metric; the precursor to one, and the cheapest early read on whether anything propagates
**Segment every one of these by entry path.** Cold arrivals and link arrivals will differ enormously on completion and time-to-first-change, and a blended number hides both. Metric 5 only exists on the link path; metric 1 on the cold path is the read on whether an empty canvas with a loaded tray is actually enough.
Instrumented but not optimised: layer count, verb usage distribution, tray source mix, cost per completed piece.
---
## 12. Milestones
**M0 — Canvas.** *Done.* Fixed 4:5, layer manipulation on touch and with a mouse, a 60-item tray per category, cold-arrival entry.
**M1 — Verbs.** *Done, then pruned (v0.2).* All six implemented; the editor offers edge and palette. Generated tray pools with caching.
**M2 — Artifact.** *Done.* Three exports, permanent URLs, OG cards, share sheet, replay.
**M3 — Persistence.** *Done except delivery.* Anonymous session save and the claim flow work; reaction notifications need a mail provider.
**M4 — Tray *(v0.2)*.** The fashion tray. Authored flats first; a photo-based item source when a rights-clean one exists.
---
## 13. Open questions
1. **Does the replay actually get shared?** The whole effort-signal argument rests on it and it's untested. Cheapest possible test: hand-make five replays, post them, see if anyone asks how.
2. **Themed tray vs. search.** *Partly answered (v0.2):* the archive themes failed exactly this way — nobody makes something about a person out of botanical plates. Polyvore's categories plus the maker's own photos is the answer being tested now. Whether it still wants search is open.
3. **Where does the addressed version come from?** Nothing in v1 makes a piece *for* a named person, and that motive is the strongest in the underlying thesis. Deferred with the riff layer, but the data model should not preclude a recipient field.
4. **Craft vs. party.** This PRD is the craft product. The party version — timed, multiplayer, degradation-as-mechanic — is a different build with a different architecture and a natural home on Discord. Choosing craft here is a real choice, not a default.
5. **Cost per completed piece** is unknown until M1 and could invalidate the anonymous-forever position.
---
*Background: adaptive-software-as-social-medium · what-makes-someone-riff · where-riffable-software-can-actually-ship · formats-that-convert-consumers-into-creators · server-remix-proposal*
