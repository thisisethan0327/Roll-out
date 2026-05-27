# Rollout — Marketing Site

Public marketing site + legal pages for [rollout.club](https://rollout.club).

This is the **web companion** to the Rollout mobile app (`mobile/` in the repo root). The mobile app links its in-app legal screens here so that `/terms`, `/privacy`, and `/guidelines` URLs in emails and shared content resolve to real pages.

## Stack

- **Next.js 15** (App Router, standalone output)
- **React 19**
- **TypeScript**
- No CSS framework — hand-rolled CSS variables in `src/app/globals.css` matching the mobile HUD design tokens
- Fonts: JetBrains Mono (display), Inter (body), Noto Sans JP (subtitles) — all via `next/font/google`

## Local dev

```bash
npm install
npm run dev          # http://localhost:3001
```

## Project layout

```
src/
├── app/
│   ├── layout.tsx            # Root layout with header + footer
│   ├── page.tsx              # / landing page
│   ├── globals.css           # Design tokens + utility classes
│   ├── terms/page.tsx        # /terms → <LegalPage docKey="terms" />
│   ├── privacy/page.tsx      # /privacy
│   ├── guidelines/page.tsx   # /guidelines
│   ├── help/page.tsx         # /help (FAQ)
│   ├── licenses/page.tsx     # /licenses
│   ├── sign-in-on-phone/page.tsx  # /sign-in-on-phone (desktop magic-link fallback)
│   └── not-found.tsx         # 404
├── components/
│   ├── SiteHeader.tsx
│   ├── SiteFooter.tsx
│   └── LegalPage.tsx         # Shared renderer for all three legal docs
└── lib/
    └── legal.ts              # Single source of truth for legal content
                              # Mirror of mobile/src/screens/LegalDocumentScreen.tsx
```

## Updating legal content

The legal copy is duplicated between mobile (in `mobile/src/screens/LegalDocumentScreen.tsx`) and web (in `src/lib/legal.ts`). When you update one, update the other — same `updated:` date, same sections.

## Deployment (Coolify on Hetzner)

The included `Dockerfile` is multi-stage Node 22 Alpine, builds to `output: 'standalone'`, runs as non-root on port 3001.

In Coolify:
1. New service → Dockerfile (Git repo)
2. Repo: this folder
3. Port: `3001`
4. Domain: `rollout.club`
5. No env vars required (purely static / build-time content)

## Adding new images

Drop into `public/images/`. Hero is `hero-harbor-run.jpg` (copy of the mobile app's onboarding hero).

If you regenerate hero art with higgsfield, name the file `hero-harbor-run.jpg` and the landing page picks it up automatically.

## Sync with mobile app

The header link in the mobile app's in-app Terms/Privacy/Guidelines screens points to in-app routes (`/legal/terms` etc.) — but Settings → Open-Source Licenses, the EULA links during sign-up, and the post-OTP email click fallback all point to `https://rollout.club/*`. Once this site is deployed, those URLs resolve.
