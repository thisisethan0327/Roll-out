# Rollout design system: Glide

Approved by Ethan on 2026-10-23 ("Go ahead and build the new design"), after five rounds of picks:

| Round | Pick |
|---|---|
| Ten styles | 03 Livery |
| Five Livery variants | L1 Tricolore |
| Five L1 directions | R5 Glide |
| Whole-app boards | Approved |
| Dark mode | Two dark styles, Midnight and Graphite, chosen in Settings |

This file is the contract for the web (rollout.club) and mobile (iOS Expo) builds. Where this file and a board disagree, the board's CSS is the visual truth. Raise the disagreement instead of guessing.

## Sources of truth

- **Visual reference:** `glide/src/R5.src.html`, the core system. Its whole first `<style>` block is the component and token spec.
- **Page boards:** `glide/G1-discover.html` to `glide/G7-appearance.html`, with sources in `glide/src/G*.src.html`. They are built only from R5's system plus small page-specific CSS.
- **Machine-readable tokens:** `glide/glide-tokens.json`, three palettes (`light`, `midnight`, `graphite`) of the same 58 tokens.
- **Published pickers:**

| Version | Link |
|---|---|
| Midnight dark | https://claude.ai/artifact/TpSMzvJujg3BoAv8Pu72Et |
| Graphite dark | https://claude.ai/artifact/QYQUXqHWhKoQPC21FD2Ycf |
| Both, with a switch | being published |

- **Imagery:** `assets/` (mock-up grade). Production images are a separate round.

## Product truth

`PRODUCT.md` still binds. The UI never claims push notifications, "ghost mode", followers-only default posts or algorithmic "near you" ranking. It never shows invented counts, ratings or testimonials. Lucide icons only, never emoji. The brand is national; never frame it as Seattle-only.

## Theme model

Three palettes, one token set:

| Setting | Values |
|---|---|
| Theme | System (default) · Light · Dark |
| Dark style | Midnight (default) · Graphite |

- **Light:** airy silver surfaces, white cards, navy primary.
- **Midnight:** deep navy surfaces (`#08111F` background, `#111D33` cards), light-blue primary.
- **Graphite:** charcoal surfaces sampled from the Tesla app (`#161718` background, `#222222` cards, `#2D2D2D` raised, secondary text `#9A9A9A`). The accents are the same as Midnight. Never say "Tesla" in the product.
- **Resolution:** dark applies when Theme = Dark, or when Theme = System and the OS is dark. The dark style then picks Midnight or Graphite.
- **Web:** `<html data-theme="light|dark" data-dark="midnight|graphite">`, set before first paint from a cookie so there is no flash. System follows `prefers-color-scheme`.
- **Mobile:** a ThemeProvider exposes the resolved palette from `useColorScheme()` plus the stored choices. Store the choices in AsyncStorage/SecureStore, and also on the profile once a column exists. That migration needs Ethan's go.
- **Images:** day images in light mode, night images in dark modes when a pair exists.

## Tokens

Use the names exactly as in `glide-tokens.json`. The key roles:

| Token | Role |
|---|---|
| `surface` / `surface-2` | page background and raised strips (segmented tracks, fields) |
| `card` / `float` / `float-ink` / `float-line` | cards and sheets, floating pills over photos (always opaque) |
| `ink` / `ink-2` / `ink-3` | text primary / secondary / tertiary-and-icons. `ink-3` is never for body text |
| `line` / `line-strong` | dividers / decorative edges: static chips, notices, the sheet grab handle. About 1.5:1, so never the only edge of a control |
| `field-line` | the edge of a control: fields, the secondary pill, toggle chips. At least 3:1 on `card`, `surface` and `surface-2` in all three palettes (Light `#78859A`, Midnight `#66779A`, Graphite `#777777`) |
| `title`, `icon`, `link` | headline colour, icon colour, link colour |
| `stripe-1..3` | the tricolore: light blue `#4BA3D9`, navy (dark: `#2F6FC4`), red `#D7263D` |
| `accent` / `on-accent` | primary pill (light: navy with white; dark: light blue with `#061224`) |
| `knob` / `knob-ink` | slide-control knob |
| `tint` / `on-tint`, `done` / `on-done` | selected and done states |
| `nav-on` / `on-nav-on` | active roundel in the floating tab bar |
| `seg*` | segmented control |
| `hud` / `on-hud*` | turn card and other heads-up panels |
| `map-*`, `route-edge`, `crew*` | map, route and convoy markers |

**Red is never text and never a theme colour.** It appears only inside the tricolore stripe, live dots and destructive icons.

## Type

| Family | Use | Notes |
|---|---|---|
| Chakra Petch 500–700, uppercase, +0.01em | display: screen titles, event and car names, section heads | |
| Michroma | numerals and codes: times, dates in roundels, prices, counts, distances, ticket codes | Never below ~10 px. Wide, so use sparingly |
| Inter Tight 300–700 | everything else: rows, body, buttons, fields | |

Use tabular numerals for times, prices, counts and distances. On iOS, respect Dynamic Type for Inter Tight text. Display and numeral styles may cap their scaling.

## Components

These are named the way R5's CSS names them. Match the shapes, radii and states.

- **Phone chrome:**
  - Floating pill tab bar: Home · Map · Garage · You, as round icon buttons. The active one is a navy roundel ringed in light blue and red.
  - Top-level screens show the tab bar. Pushed task screens (checkout, booking, create-event steps, detail views) hide it and anchor one primary action at the bottom. This is an open question for Ethan.
- **Primary action:** one style only. A pill with a circle knob (`.btn` / `.slide`). As a button, the knob is an end cap with an arrow. As a slide-to-act control, the knob drags, completes past about 82%, and also completes on tap or Enter. Its done state uses `done` / `on-done`.
- **Floating pills over photos:** search pill with a filter button, title pills, round icon buttons. Opaque, with no decorative blur.
- **Cards:** rounded 24–32 px, white (light) or `card` (dark). A tricolore edge stripe marks the lead or selected card. No card grids of icon + heading + text.
- **Lists:** plain rows (icon roundel · label · sub-label · value · chevron), grouped by spacing, at least 44 pt tall.
- **Chips and segmented controls:** pill chips, and the navy segmented control (light) / `seg` (dark). Segment buttons are 44 px tall.
- **Toggle chip** (`.g-tchip`, `ToggleChip`): a 44 px pill for filters and pickers, `field-line` edge, navy (`nav-on`) when on. On is `aria-pressed` for buttons, `aria-current` for links, `aria-checked` in a radio group.
- **Fields** (`src/components/glide/fields.tsx`):
  - `.g-in` (`Input`, `TextArea`, `Select`): the G3 field box, 52 px, 16 px radius, `card` fill, 1 px `field-line` edge, 2 px `accent` edge on focus, `surface` fill when read-only or disabled.
  - `.g-in--pill` (`pill`): the sign-in board's 56 px round field on `surface`, 1.5 px edge.
  - `.g-pf` (`PillField`): the same pill as a wrapper for an icon, a fixed prefix (`.g-pf-pre`) and a 44 px trailing button (`.g-pf-x`).
  - `.g-field` (`Field`): label (`.g-field-l`), control, then a hint (`.g-field-h`) or error (`.g-field-e`).
- **Disabled:** a disabled primary (`.g-btn`) or secondary (`.g-sec`) pill is a flat `surface-2` pill with `ink-2` text and a quiet knob, at full opacity. No faded accent: that reads as loading.
- **Roundels:** a date roundel (Michroma day number, month or day label above) with tricolore rings when selected.
- **Sheets:** bottom sheets with a grab handle, 30 px top radius, a scrim at `rgba(var(--scrim),.45)`, and close by ×, scrim, swipe-down or Escape. A sheet holding typed input stops closing on the scrim (see Overlays).
- **Maps:** tokenised map palette, with the tricolore route (edge, light blue, navy, red bands) and crew dots. MapLibre zoom buttons are 44 px in any Glide scope (`.g-mapctl` opts in anything else).
- **Isometric Garage and Shop:**
  - Day and night diorama images with percentage-positioned 44 px hotspots that pulse.
  - The selected hotspot shows a roundel and label, and drives the sheet below.
  - Production needs real per-member garages: start with a fixed diorama and the member's car chibi, and open a separate design and asset round.

## Web kit contracts

- **Headings:** inside a Glide scope, a bare `h1`–`h4` is display type (Chakra Petch, uppercase, +0.02em, `title`). The legacy `globals.css` tracking (4 px on `h1`, 1.5 px on `h3`) never reaches a Glide page. Any class rule overrides the baseline.
- **Rows:** `Row` with `href` keeps its hairline; only the last row in a list drops it.
- **Card:** `as` takes `div`, `section`, `aside`, `article`, `li`, `form`, `header`, `footer`, `nav`, `fieldset`, `ul`, `ol` or `label`; `href` makes the whole card a link.
- **SlideToAct:** the knob springs back when `onComplete` returns `false` or a Promise that rejects or resolves `false` (it shows busy while the Promise runs), or when `resetOn` changes. Remounting with a new `key` still works.

## Overlays: the lightest one that does the job

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
- Never `window.confirm` / `alert` / `prompt`.
- Toasts: errors stay until dismissed, successes auto-dismiss, at most 3 on screen, identical ones collapse. Nothing someone must act on later is a toast. A state that persists ("Payment authorized") stays an inline Notice.
- First-run prompts queue with `claimPrompt` / `releasePrompt`, one at a time.
- One shared implementation per piece: no hand-rolled modal, confirm, sheet or lightbox.
- Await `confirmDialog()` before starting a transition, never inside one.

Ported from emwraps-tickets origin/master 7df9702 (overlay plan, Documents/ui-audits/rollout-web/overlay-redesign-plan.md).

## Motion

Short ease-out transitions (150–250 ms). Hotspots pulse. Slide controls spring back on a short drag. Respect Reduce Motion: no pulses, no springs, instant states.

## Accessibility

- WCAG AA for all text in Light, Midnight and Graphite. Every board measured its pairs; keep the token values.
- Non-text UI needs at least 3:1.
- Targets are at least 44 pt.
- Every control works with a keyboard on web and with VoiceOver on iOS (labels on icon buttons and hotspots).

## What changes per platform

- **Web (rollout.club, Next.js 15):**
  - Load the fonts with `next/font/google`.
  - Tokens are CSS variables on `:root[data-theme]` / `[data-dark]`.
  - Components live under `src/components/glide/`.
  - Pages adopt them surface by surface.
  - Admin and console pages keep working throughout and get restyled last.
- **Mobile (Expo SDK 54, RN 0.81):**
  - Fonts come from `@expo-google-fonts/{chakra-petch,michroma,inter-tight}`. These are pure JS and font assets, so check the iOS fingerprint stays OTA-compatible.
  - Tokens and palettes live in `src/theme`.
  - Components build on the existing structure.
  - Any release goes out from the live release line, not origin/main. See the memory note on the release line.
