# Clipping: objects from the web

On any product page: click the bookmarklet, hover over a photo, click it. The
object lands in the studio's library with what the page knew about it, cut out
of its backdrop when the photo allows, ready to drop on the canvas.

## What gets stored

```
Object
 ├── originalImage     the photo as clipped (blob)
 ├── cutoutImage       transparent PNG of the thing itself (blob), when possible
 ├── cutout            done / skipped (with reason) / none
 ├── source            url, canonical url, retailer, host, page title, methods
 ├── clippedBy         creator id
 ├── title, brand, price, category, description
 ├── attributes        colour, material, size, sku… (free-form)
 ├── embedding         semantic embedding (reserved; filled by an enricher)
 └── used_in           derived: every Creation whose pieces reference the object
```

Types live in `lib/objects/schema.ts`. `used_in` is never stored on the
object; it is a query over creations (`usageCounts`, `usedIn`), so the count
"your butterfly chair has been used in 1,842 creations" cannot drift.

## Storage

`lib/objects/store.ts` defines one `ObjectStore` interface and three backends:

| Backend | File | Used when |
| --- | --- | --- |
| Supabase | `lib/objects/supabase-store.ts`, `supabase/migrations/` | `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set. The shared library: everyone sees every object, you write only what is yours. |
| IndexedDB | `lib/objects/indexeddb-store.ts` | No Supabase configured, or it could not sign the user in. Library is per browser. |
| Memory | `lib/objects/store.ts` | Tests, server rendering. |

The studio only talks to the interface (`hooks/use-library.ts`). With
Supabase the browser talks straight to Postgres and Storage; there is no API
layer. Row level security does the ownership: objects, creations and their
edges are publicly readable, and writable only by their `clipped_by` /
`owner_id`, which is the Auth user id (anonymous sign-in is enough, enable it
under Authentication → Providers). Image bytes go to the public `objects`
bucket under `<user id>/<object id>/original|cutout`; the storage policies
check that first folder against the caller.

Two SQL functions do the work the interface needs atomically:
`save_creation` upserts a creation and its `creation_objects` edges in one
transaction, and `usage_counts` answers "used in N creations" for a batch.
The `embedding` column is pgvector, any dimension, ready for an enricher.

The collage on the canvas is autosaved as a Creation (debounced, flushed on
`pagehide`). "New" leaves the current creation in the library and starts a
fresh one, which is how an object accumulates uses.

Identity starts invisible. On first visit the studio signs the browser in
anonymously, so clipping works with no sign-up and the anonymous user owns
what it clips. Autosave keeps writing under that identity. The **Save**
button is where the account conversation happens: it writes the collage,
then offers to keep the library by attaching an email to the same user
(`auth.updateUser`), which keeps every clip and creation already made.
"Sign in instead" sends a magic link (`signInWithOtp`) for someone who
already claimed an account on another device. The auth client uses the
implicit flow so a link opened on a different device still signs in.

For the emails to land back in the studio, set the Site URL and add the
deployed origin under Authentication → URL Configuration in Supabase.

To set up a project:

```sh
cp .env.example .env.local      # fill in the project URL and anon key
supabase link --project-ref <ref>
supabase db push                # applies supabase/migrations
```

The migration and its policies were exercised against a local Postgres with
stand-ins for `auth.uid()` and the storage schema: a second user can read and
use your object but cannot edit, delete or forge it, cannot overwrite your
creation, cannot upload into your folder, and a signed-out reader sees
everything and writes nothing.

## Extraction

`lib/clip/extract.ts`, in order of trust, each layer filling what the one
above left empty:

1. JSON-LD `schema.org/Product` (also `ProductGroup`, `@graph`, `AggregateOffer`
   low price, `additionalProperty`, `BreadcrumbList` for category)
2. Microdata `itemtype=schema.org/Product` itemprops
3. OpenGraph / `product:*` meta tags
4. DOM heuristics: canonical link, `h1`, image alt, price-looking text near the
   clicked element, breadcrumb nav, retailer from the hostname

The pure functions take strings and records so they run under `node --test`
(`npm test`). Only `extractFromDocument` touches the DOM.

Vision/AI enrichment is the fallback layer this leaves room for: the
`ExtractionMethod` union already carries `vision`, and `ClipObject.embedding`
is reserved. Neither is wired to a model yet.

## Categories

Retailers describe things in their own words: a breadcrumb reading
"Women / Outerwear / Puffers", a JSON-LD category of "Sneakers", a title of
"Bias-cut slip dress". The library has one fixed set of tiles, so a clip is
only findable once those words are mapped onto it.

`lib/clip/categorize.ts` does that at clip time, trying the most trustworthy
signal first: the retailer's category, then product attributes, then the
title, and last the URL path. Rules are ordered and the first match wins,
which is what makes a denim jacket outerwear rather than jeans. Phrases
where one category's word sits inside another's are rewritten before
matching, so "dress shirt" is a shirt, "dress shoes" are shoes and "top
handle bag" is a bag. Nothing recognisable gives no category rather than a
wrong one.

The retailer's own wording is kept in `attributes.sourceCategory`.
`categoryFor` derives a category for clips stored before this existed, so
nothing is stranded. The tile in the Clipped tab keeps a picker to
correct it behind its dots button, which writes through `setCategory` on the
store.

The library grid draws from the catalog and from your clips together, so a
clipped dress sits under Dresses beside the built-in pieces, marked with a
scissors.

## Cutout

`lib/clip/cutout.ts`. `cutoutFlatBackground` samples the border of the photo,
refuses when the backdrop is busy (a bad cutout is worse than none), otherwise
flood-fills the backdrop away from the edges inward, feathers the edge one
pixel and crops to the object. Studio shots on white or grey come out as
proper objects; editorial photos are kept as photos and flagged in the
library.

`Cutter` is the seam for the model path. `FlatBackgroundCutter` ships;
a segmentation-model cutter implements the same `detect` / `cut` pair, and
`detect` is what powers "Clip dress / Clip shoes / Clip bag" when the photo
shows more than one thing. `ClipPayload.pick` and `ingestClip` already carry
the chosen detection through to the stored object.

## The clipper

`web/clip/main.ts` runs inside the retailer's page. It is loaded by the
bookmarklet (shown under "Clip from the web" in the studio) as one classic
script, `clip.js`, built by `vite.clip.config.ts`. The same file is the
content script for a browser extension, which is the answer for sites whose
content-security policy blocks bookmarklets.

Handshake: the clipper opens the receiver at `/clip?clip=<token>` (inside the
click, so pop-up blockers allow it), the receiver posts `offcut:ready` to its
opener, the clipper posts the payload back with the same token. The image
travels as a data URL because the clipper, on the retailer's origin, can
usually fetch the CDN image and the studio cannot.

The receiver (`app/clip/page.tsx`) is a page with nothing on it, because the
studio is a canvas: opening one to catch a clip shows the last collage, saves
over it from a second tab, and leaves the maker with a window they did not
ask for. The receiver takes the clip in through `receiveClip`, which picks the
store the way the studio does and writes no creation, announces it on the
`offcut:clips` broadcast channel, and then asks that channel whether a studio
is listening: if one answers it closes itself, and if none does it becomes the
studio. A studio that hears the announcement reloads its library and turns to
the Clipped tab, so the clip appears in the tab the maker is already in.

A cross-site iframe would save the window, but not the library: third-party
storage is partitioned, so an iframe of this origin on a retailer's page gets
an empty bucket rather than the real one. A window of our own is the only way
to the library.

## Running it

```sh
npm test               # extractor, cutout and store unit tests
npm run build:vercel   # studio + clip.js into dist-vercel/
npm run dev:vercel     # the bookmarklet points at the TypeScript source
```

The Cloudflare/Sites build (`npm run build`) includes the studio and the
storage layer but does not emit `clip.js`; the bookmarklet needs the static
build's origin until that build gains the second entry.
