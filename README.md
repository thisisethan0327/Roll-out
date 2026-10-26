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

## UI rules: overlays

Owner rule, 2026-10-24 (Documents/CLAUDE.md §12; applies to every app). Disruption goes up this list; pick the first row that does the job.

| Job | Use (Glide kit) |
|---|---|
| Explain a control | `InfoTip` (`glide/InfoTip.tsx`), never a paragraph |
| "Saved", "Sent", anything that needs no decision | `toast.success()` (`glide/Toast.tsx`), goes away by itself |
| A change that can be put back (unpublish, remove a line, soft-delete) | `undoToast()`, not a confirm |
| Field validation | inline at the field (`Field error`, `.g-field-e`), never a toast |
| Something unresolved that matters | one banner at the top, never a pile |
| Row-level "sure?" (remove a line, delete a photo, unban) | two-tap armed button (`useArmed`, `src/lib/overlay/useArmed.ts`), not a centred dialog |
| Irreversible, money, or sends something to a customer | `confirmDialog()` (`glide/confirm.tsx`): the title names the object, the button is a verb, focus lands on Cancel; `reason` replaces `prompt()` |
| Short decision or a form with ≤ 5 fields | `Modal` (`glide/Modal.tsx`), a bottom card under 600 px |
| Action list / picker on a phone | `Sheet` (`glide/Sheet.tsx`) |
| Long form (many fields, scrolling, steps) | `Drawer` (`glide/Drawer.tsx`): right panel on desktop, full screen under 760 px, with a local draft (`useFormDraft` + `DraftResumeBar`) |
| Photos / video | `Lightbox` (`glide/Lightbox.tsx`) |
| Multi-page flow | a page |

Rules that always hold:

- A form overlay never closes on a backdrop click (`closeOnBackdrop` is opt-in on Modal and Drawer; pass `false` on a Sheet once it holds typed input). Escape and × ask "Discard changes?" only when `dirty`. Nothing closes while `closable` is false (a save or money call in flight).
- Every long form keeps a local draft (`rollout:draft:<key>` in localStorage) and offers Resume.
- Escape reaches only the topmost overlay, and the body scroll lock is counted (`src/lib/overlay`: `useOverlayLayer`, `useScrollLock`, `useRequestClose`). A popover or picker that closes on Escape registers a layer too (`EventPicker`, the admin `JumpBar`, `InfoTip`, an armed button). Never add your own `keydown` Escape listener or touch `body.style.overflow`.
- Armed buttons stay armed until the second tap. No timer. A tap anywhere else, Escape or leaving the page disarms.
- Never `window.confirm` / `alert` / `prompt`. `npm run check:dialogs` fails on any call in `src/` (there is no ESLint setup yet).
- Toasts: errors stay until dismissed, successes auto-dismiss, at most 3 on screen, identical ones collapse. Nothing someone must act on later is a toast. A state that persists ("Payment authorized") stays an inline Notice.
- First-run prompts queue with `claimPrompt` / `releasePrompt`, one at a time.
- One shared implementation per piece: no hand-rolled modal, confirm, sheet or lightbox.
- Await `confirmDialog()` before starting a transition, never inside one.

The full contract is in `docs/design/GLIDE.md` ("Overlays").

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
