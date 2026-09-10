# Deploy Muse on Vercel

Import `iris-skyvalley/collage` into Vercel. Use the repository root (the folder containing `package.json` and `vercel.json`) as the Root Directory.

The checked-in `vercel.json` sets:
- Framework: Vite
- Build Command: `npm run build:vercel`
- Output Directory: `dist-vercel`

No environment variables or backend services are required for the collage editor. Select Node.js 22.x or 24.x. Remove any old dashboard overrides for Next.js, the build command, or the output directory, then redeploy the latest commit.

The Vercel build uses the same `app/page.tsx`, collage data, styles, and product assets as the Sites build. It creates `dist-vercel/index.html` and static assets instead of a Cloudflare Worker. The ordinary `npm run build` remains the Sites/Cloudflare build.

Validate locally:

```sh
npm ci
npm run build:vercel
npm run dev:vercel
```

The editor is session-only. Export a PNG before closing or refreshing the page to keep a composition.
