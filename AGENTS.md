<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Deploy (Vercel)

- **Web production:** push to GitHub (`git push origin main`); Vercel Git integration builds and deploys automatically.
- **Do not** run `vercel deploy` or `vercel deploy --prod` for routine releases (CLI uploads the full local tree, often 1GB+).
- **Desktop:** `npm run desktop:build` → installer under `release-dist/`; not part of Vercel deploy.

See `docs/cloud-deploy.md`.
