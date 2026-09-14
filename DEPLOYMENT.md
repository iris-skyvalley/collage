# Deploy Offcut on Vercel

Import `iris-skyvalley/collage` into Vercel. Use the repository root (the folder containing `package.json` and `vercel.json`) as the Root Directory.

The checked-in `vercel.json` sets:
- Framework: Vite
- Build Command: `npm run build:vercel`
- Output Directory: `dist-vercel`

No environment variables or backend services are required for the collage editor. Select Node.js 22.x or 24.x. Remove any old dashboard overrides for Next.js, the build command, or the output directory, then redeploy the latest commit.

The Vercel build uses the same `app/page.tsx`, collage data, styles, and product assets as the Sites build. It creates `dist-vercel/index.html`, static assets, and `dist-vercel/clip.js` (the clipper the bookmarklet loads into other sites; see `CLIPPING.md`) instead of a Cloudflare Worker. The ordinary `npm run build` remains the Sites/Cloudflare build.

Clipped objects and the working collage go to Supabase when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in the Vercel project (apply `supabase/migrations` first and enable anonymous sign-in). Without them the library stays in the browser (IndexedDB). See `CLIPPING.md`.

Validate locally:

```sh
npm ci
npm run build:vercel
npm run dev:vercel
```

The collage autosaves in this browser. Export a PNG to keep a composition anywhere else.
