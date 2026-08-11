/**
 * Event-invitation renderers — one shared skeleton, four art directions.
 *
 * Every style carries the same content contract (event name, type badge,
 * date/time with timezone, location, host-shop branding, personal-note slot,
 * big RSVP button → event page with ?invite=<token>, add-to-calendar link,
 * opt-out footer, "via rollout.club" line) so the set reads as one system while
 * looking distinct. Email-safe: table layout, inline styles only, no external
 * assets beyond the shop logo URL.
 *
 * Isomorphic — imported by the client preview and the server send path alike.
 */
import type {
    InviteBranding,
    InviteEvent,
    InviteRenderInput,
    InviteStyleKey,
    InviteStyleMeta,
    RenderedInvite,
} from './types';

export const INVITE_STYLES: InviteStyleMeta[] = [
    { key: 'hud', name: 'HUD / Street', blurb: 'Dark, gold, monospace — the Rollout look.' },
    { key: 'minimal', name: 'Minimal', blurb: 'Clean light, typographic, understated.' },
    { key: 'poster', name: 'Poster', blurb: 'Bold, type-driven, event name huge.' },
    { key: 'classic', name: 'Classic Card', blurb: 'Warm invitation card, centered.' },
];

const DEFAULT_BASE = 'https://rollout.club';

// ── Shared utilities ───────────────────────────────────────────────────

export function escapeHtml(s: string): string {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Absolute-ish color guard so a malformed brand color can't break the doc. */
function safeColor(c: string | null | undefined, fallback: string): string {
    if (!c) return fallback;
    const t = c.trim();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t)) return t;
    if (/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i.test(t)) return t;
    return fallback;
}

/** "Fri · Aug 15, 2026 · 8:00 PM PDT" — always with an explicit timezone. */
export function formatEventDateTime(iso: string, timeZone = 'America/Los_Angeles'): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Date TBA';
    const parts = new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short',
        timeZone,
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const wd = get('weekday');
    const mo = get('month');
    const day = get('day');
    const yr = get('year');
    const hr = get('hour');
    const min = get('minute');
    const dp = get('dayPeriod');
    const tz = get('timeZoneName');
    return `${wd} · ${mo} ${day}, ${yr} · ${hr}:${min} ${dp} ${tz}`;
}

export function buildRsvpUrl(base: string, eventId: string, token: string): string {
    return `${base}/event/${eventId}?invite=${encodeURIComponent(token)}`;
}

export function buildIcsUrl(base: string, eventId: string): string {
    return `${base}/event/${eventId}/ics`;
}

function shopUrl(base: string, b: InviteBranding): string {
    return b.pageHandle ? `${base}/u/${b.pageHandle}` : base;
}

/** Logo mark, or a wordmark fallback in the given color. */
function logoMark(b: InviteBranding, color: string, align: 'center' | 'left'): string {
    if (b.logoUrl) {
        return `<img src="${escapeHtml(b.logoUrl)}" alt="${escapeHtml(b.shopName)}" style="max-height:46px;max-width:200px;display:block;${align === 'center' ? 'margin:0 auto;' : ''}" />`;
    }
    return `<div style="font-family:Arial,Helvetica,sans-serif;font-weight:800;font-size:20px;letter-spacing:3px;color:${color};text-transform:uppercase;">${escapeHtml(b.shopName)}</div>`;
}

interface Ctx {
    b: InviteBranding;
    ev: InviteEvent;
    base: string;
    greetingName: string;
    note: string | null;
    rsvpUrl: string;
    icsUrl: string;
    when: string;
    where: string;
    accent: string;
    accent2: string;
    /** "hosted by" line — host + accepted co-hosts joined by × (already escaped). */
    hostedBy: string;
    /** True when more than one shop is hosting (co-hosts present). */
    multiHost: boolean;
}

/** De-duped, trimmed host list; falls back to the sender shop's from-name. */
function resolveHostNames(input: InviteRenderInput): string[] {
    const raw = (input.hostNames && input.hostNames.length
        ? input.hostNames
        : [input.branding.fromName])
        .map((n) => (n || '').trim())
        .filter(Boolean);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const n of raw) {
        const k = n.toLowerCase();
        if (!seen.has(k)) {
            seen.add(k);
            out.push(n);
        }
    }
    return out.length ? out : [input.branding.fromName];
}

function buildCtx(input: InviteRenderInput): Ctx {
    const base = input.baseUrl ?? DEFAULT_BASE;
    const b = input.branding;
    const ev = input.event;
    const accent = safeColor(b.primaryColor, '#e8a845');
    const accent2 = safeColor(b.secondaryColor, accent);
    const where = [ev.locationName, ev.locationDetail].filter(Boolean).join(' · ');
    const hosts = resolveHostNames(input);
    const hostedBy = hosts.map(escapeHtml).join(' &times; ');
    return {
        multiHost: hosts.length > 1,
        b,
        ev,
        base,
        greetingName: (input.invitedName || '').trim() || 'there',
        note: (input.personalNote || '').trim() || null,
        rsvpUrl: buildRsvpUrl(base, ev.id, input.token),
        icsUrl: buildIcsUrl(base, ev.id),
        when: formatEventDateTime(ev.startAtISO),
        where: where || 'Location TBA',
        accent,
        accent2,
        hostedBy,
    };
}

function subjectFor(b: InviteBranding, ev: InviteEvent): string {
    return `You're invited: ${ev.title} — hosted by ${b.fromName}`;
}

// Small "via rollout.club" + opt-out footer, tuned light/dark per style.
function footer(ctx: Ctx, opts: { dark: boolean }): string {
    const muted = opts.dark ? '#5a5a6e' : '#9a9aa8';
    const link = opts.dark ? '#8a8a9a' : '#7a7a88';
    return `
<p style="margin:0;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:9px;letter-spacing:2px;color:${muted};">SENT BY ROLLOUT ON BEHALF OF <a href="${escapeHtml(shopUrl(ctx.base, ctx.b))}" style="color:${link};text-decoration:none;">${escapeHtml(ctx.b.shopName.toUpperCase())}</a></p>
<p style="margin:6px 0 0;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:9px;letter-spacing:1.5px;color:${muted};">Not expecting this? Reply <b>STOP</b>${ctx.b.supportEmail ? ` or email <a href="mailto:${escapeHtml(ctx.b.supportEmail)}?subject=unsubscribe" style="color:${link};text-decoration:none;">${escapeHtml(ctx.b.supportEmail)}</a>` : ''} to opt out.</p>`;
}

// ── Style 1 — HUD / Street (dark, gold, mono) ──────────────────────────

function renderHud(ctx: Ctx): string {
    const { b, ev, accent, accent2 } = ctx;
    const note = ctx.note
        ? `<tr><td style="padding:0 28px;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-left:2px solid ${accent};padding:10px 0 10px 14px;"><div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:9px;letter-spacing:3px;color:${accent};margin-bottom:5px;">// FROM ${escapeHtml(b.fromName.toUpperCase())}</div><div style="font-size:14px;color:#d8d8e0;line-height:1.6;font-style:italic;">${escapeHtml(ctx.note)}</div></td></tr></table></td></tr><tr><td style="height:22px;"></td></tr>`
        : '';
    const row = (label: string, value: string) =>
        `<tr><td style="padding:9px 0;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:10px;letter-spacing:2px;color:#8a8a9a;text-transform:uppercase;width:96px;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:9px 0;font-size:14px;color:#f0f0f0;line-height:1.5;">${escapeHtml(value)}</td></tr>`;
    return `<body style="margin:0;padding:0;background:#050508;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#f0f0f0;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#050508;padding:36px 16px;"><tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0" style="max-width:540px;width:100%;">
  <tr><td align="center" style="padding-bottom:18px;">${logoMark(b, accent, 'center')}<div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:9px;letter-spacing:4px;color:#8a8a9a;margin-top:8px;">${escapeHtml(b.shopName.toUpperCase())} · INVITATION</div></td></tr>
  <tr><td style="background:#0c0c14;border:1px solid #1a1a28;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:26px 28px 6px;"><div style="display:inline-block;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:9px;letter-spacing:3px;color:#050508;background:${accent};padding:5px 10px;">${escapeHtml(ev.typeLabel.toUpperCase())}</div>${ev.code ? `<span style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:9px;letter-spacing:2px;color:#5a5a6e;margin-left:10px;">${escapeHtml(ev.code)}</span>` : ''}</td></tr>
      <tr><td style="padding:8px 28px 4px;"><h1 style="margin:0;font-size:26px;font-weight:800;letter-spacing:0.5px;color:#f0f0f0;line-height:1.15;">${escapeHtml(ev.title)}</h1></td></tr>
      <tr><td style="padding:6px 28px 0;"><div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:10px;letter-spacing:2px;color:${accent2};text-transform:uppercase;">Hosted by ${ctx.hostedBy}</div></td></tr>
      <tr><td style="padding:12px 28px 4px;"><p style="margin:0;font-size:14px;color:#b5b5b5;line-height:1.55;">Hey ${escapeHtml(ctx.greetingName)} — you're on the roll call.</p></td></tr>
      <tr><td style="padding:14px 28px 4px;"><table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #2a2a3a;border-bottom:1px solid #2a2a3a;">${row('When', ctx.when)}${row('Where', ctx.where)}</table></td></tr>
      <tr><td style="height:22px;"></td></tr>
      ${note}
      <tr><td align="center" style="padding:0 28px;"><table cellpadding="0" cellspacing="0"><tr><td align="center" style="background:${accent};"><a href="${escapeHtml(ctx.rsvpUrl)}" style="display:inline-block;padding:15px 40px;color:#050508;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:12px;font-weight:700;text-decoration:none;letter-spacing:4px;">RSVP NOW ›</a></td></tr></table></td></tr>
      <tr><td align="center" style="padding:14px 28px 28px;"><a href="${escapeHtml(ctx.icsUrl)}" style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:10px;letter-spacing:2px;color:${accent2};text-decoration:none;">+ ADD TO CALENDAR (.ICS)</a></td></tr>
    </table>
  </td></tr>
  <tr><td align="center" style="padding-top:16px;">${footer(ctx, { dark: true })}</td></tr>
</table>
</td></tr></table>
</body>`;
}

// ── Style 2 — Minimal (clean light, typographic) ───────────────────────

function renderMinimal(ctx: Ctx): string {
    const { b, ev, accent } = ctx;
    const note = ctx.note
        ? `<tr><td style="padding:0 40px 8px;"><p style="margin:0;font-size:15px;color:#333;line-height:1.65;">${escapeHtml(ctx.note)}</p></td></tr>`
        : '';
    const line = (label: string, value: string) =>
        `<tr><td style="padding:6px 0;font-size:12px;letter-spacing:1px;color:#999;text-transform:uppercase;width:80px;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:6px 0;font-size:15px;color:#222;line-height:1.5;">${escapeHtml(value)}</td></tr>`;
    return `<body style="margin:0;padding:0;background:#f4f4f2;font-family:Georgia,'Times New Roman',serif;color:#222;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;padding:44px 16px;"><tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#ffffff;">
  <tr><td style="padding:36px 40px 0;">${logoMark(b, accent, 'left')}</td></tr>
  <tr><td style="padding:24px 40px 0;"><div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:3px;color:${accent};text-transform:uppercase;">${escapeHtml(ev.typeLabel)} · You're invited</div></td></tr>
  <tr><td style="padding:10px 40px 0;"><h1 style="margin:0;font-size:30px;font-weight:400;color:#1a1a1a;line-height:1.2;">${escapeHtml(ev.title)}</h1></td></tr>
  <tr><td style="padding:6px 40px 0;"><div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#888;">Hosted by <span style="color:#555;font-weight:600;">${ctx.hostedBy}</span></div></td></tr>
  <tr><td style="padding:8px 40px 0;"><p style="margin:0;font-size:15px;color:#555;line-height:1.65;">Dear ${escapeHtml(ctx.greetingName)}, we'd love to have you there.</p></td></tr>
  <tr><td style="padding:20px 40px 0;"><table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eee;border-bottom:1px solid #eee;padding:8px 0;">${line('When', ctx.when)}${line('Where', ctx.where)}</table></td></tr>
  <tr><td style="height:22px;"></td></tr>
  ${note}
  <tr><td style="padding:8px 40px 0;"><table cellpadding="0" cellspacing="0"><tr><td style="background:${accent};border-radius:2px;"><a href="${escapeHtml(ctx.rsvpUrl)}" style="display:inline-block;padding:13px 34px;color:#fff;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;text-decoration:none;letter-spacing:1px;">RSVP</a></td></tr></table></td></tr>
  <tr><td style="padding:12px 40px 36px;"><a href="${escapeHtml(ctx.icsUrl)}" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#888;text-decoration:underline;">Add to calendar</a></td></tr>
  <tr><td style="padding:0 40px 30px;border-top:1px solid #f0f0f0;padding-top:18px;">${footer(ctx, { dark: false })}</td></tr>
</table>
</td></tr></table>
</body>`;
}

// ── Style 3 — Poster (bold, type-driven, event name huge) ──────────────

function renderPoster(ctx: Ctx): string {
    const { b, ev, accent, accent2 } = ctx;
    const note = ctx.note
        ? `<tr><td style="padding:22px 34px 0;"><p style="margin:0;font-size:15px;color:#1a1a1a;line-height:1.6;font-weight:600;">"${escapeHtml(ctx.note)}"</p></td></tr>`
        : '';
    return `<body style="margin:0;padding:0;background:#111;font-family:'Arial Black',Arial,Helvetica,sans-serif;color:#111;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#111;padding:0;"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
  <tr><td style="background:${accent};padding:20px 34px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-family:'Arial Black',Arial,sans-serif;font-weight:900;font-size:13px;letter-spacing:3px;color:#111;text-transform:uppercase;">${escapeHtml(ev.typeLabel)}</td>
      <td align="right" style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:2px;color:#111;text-transform:uppercase;">You're invited</td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#f5f3ee;padding:34px 34px 8px;">
    <div style="font-family:Arial,sans-serif;font-size:12px;letter-spacing:2px;color:#666;text-transform:uppercase;">Hosted by ${ctx.hostedBy}</div>
    <h1 style="margin:8px 0 0;font-family:'Arial Black',Arial,sans-serif;font-weight:900;font-size:46px;line-height:0.98;color:#111;text-transform:uppercase;letter-spacing:-1px;">${escapeHtml(ev.title)}</h1>
  </td></tr>
  <tr><td style="background:#f5f3ee;padding:20px 34px 0;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="border-top:3px solid #111;padding-top:12px;font-family:Arial,sans-serif;font-size:18px;font-weight:800;color:#111;line-height:1.3;">${escapeHtml(ctx.when)}</td></tr>
      <tr><td style="font-family:Arial,sans-serif;font-size:15px;font-weight:600;color:#333;line-height:1.4;padding-top:4px;">${escapeHtml(ctx.where)}</td></tr>
    </table>
  </td></tr>
  ${note}
  <tr><td style="background:#f5f3ee;padding:26px 34px 6px;"><table cellpadding="0" cellspacing="0" width="100%"><tr><td align="center" style="background:#111;"><a href="${escapeHtml(ctx.rsvpUrl)}" style="display:block;padding:18px;color:${accent};font-family:'Arial Black',Arial,sans-serif;font-weight:900;font-size:16px;text-decoration:none;letter-spacing:3px;text-transform:uppercase;">RSVP →</a></td></tr></table></td></tr>
  <tr><td style="background:#f5f3ee;padding:12px 34px 30px;" align="center"><a href="${escapeHtml(ctx.icsUrl)}" style="font-family:Arial,sans-serif;font-size:12px;font-weight:700;color:${accent2};text-decoration:none;letter-spacing:1px;text-transform:uppercase;">+ Add to calendar</a></td></tr>
  <tr><td style="background:#111;padding:18px 34px;" align="center">${footer(ctx, { dark: true })}</td></tr>
</table>
</td></tr></table>
</body>`;
}

// ── Style 4 — Classic card (warm, centered invitation) ─────────────────

function renderClassic(ctx: Ctx): string {
    const { b, ev, accent } = ctx;
    const note = ctx.note
        ? `<tr><td align="center" style="padding:6px 44px 0;"><p style="margin:0;font-size:15px;color:#4a4038;line-height:1.7;font-style:italic;">${escapeHtml(ctx.note)}</p></td></tr>`
        : '';
    return `<body style="margin:0;padding:0;background:#efe9df;font-family:Georgia,'Times New Roman',serif;color:#3a322b;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#efe9df;padding:44px 16px;"><tr><td align="center">
<table width="500" cellpadding="0" cellspacing="0" style="max-width:500px;width:100%;background:#fffdf8;border:1px solid #ddd2c2;">
  <tr><td style="padding:8px;"><table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${accent};"><tr><td style="padding:34px 40px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="padding-bottom:14px;">${logoMark(b, accent, 'center')}</td></tr>
      <tr><td align="center"><div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:4px;color:${accent};text-transform:uppercase;">${escapeHtml(ev.typeLabel)}</div></td></tr>
      <tr><td align="center" style="padding:6px 0 0;"><p style="margin:0;font-size:14px;color:#6a5f54;line-height:1.6;"><span style="font-weight:700;color:#4a3f34;">${ctx.hostedBy}</span> ${ctx.multiHost ? 'request' : 'requests'} the pleasure of your company, ${escapeHtml(ctx.greetingName)}, at</p></td></tr>
      <tr><td align="center" style="padding:12px 0 6px;"><h1 style="margin:0;font-size:30px;font-weight:400;color:#2a231d;line-height:1.25;">${escapeHtml(ev.title)}</h1></td></tr>
      <tr><td align="center" style="padding:10px 0 0;"><div style="width:44px;border-top:2px solid ${accent};margin:0 auto;"></div></td></tr>
      <tr><td align="center" style="padding:14px 0 2px;"><div style="font-size:16px;color:#3a322b;font-weight:700;">${escapeHtml(ctx.when)}</div></td></tr>
      <tr><td align="center" style="padding:2px 0 0;"><div style="font-size:15px;color:#5a4f45;line-height:1.5;">${escapeHtml(ctx.where)}</div></td></tr>
      <tr><td style="height:18px;"></td></tr>
      ${note}
      <tr><td align="center" style="padding:22px 0 0;"><table cellpadding="0" cellspacing="0"><tr><td align="center" style="background:${accent};"><a href="${escapeHtml(ctx.rsvpUrl)}" style="display:inline-block;padding:13px 40px;color:#fffdf8;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;text-decoration:none;letter-spacing:2px;text-transform:uppercase;">RSVP</a></td></tr></table></td></tr>
      <tr><td align="center" style="padding:12px 0 0;"><a href="${escapeHtml(ctx.icsUrl)}" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8a7f72;text-decoration:underline;">Add to calendar</a></td></tr>
    </table>
  </td></tr></table></td></tr>
  <tr><td align="center" style="padding:16px 40px 26px;">${footer(ctx, { dark: false })}</td></tr>
</table>
</td></tr></table>
</body>`;
}

const RENDERERS: Record<InviteStyleKey, (ctx: Ctx) => string> = {
    hud: renderHud,
    minimal: renderMinimal,
    poster: renderPoster,
    classic: renderClassic,
};

/** Render a full invitation email (subject + HTML) for one recipient/style. */
export function renderInvite(input: InviteRenderInput): RenderedInvite {
    const ctx = buildCtx(input);
    const renderBody = RENDERERS[input.style] ?? renderHud;
    return {
        subject: subjectFor(ctx.b, ctx.ev),
        html: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escapeHtml(subjectFor(ctx.b, ctx.ev))}</title></head>${renderBody(ctx)}</html>`,
    };
}

/** Convenience for the live srcdoc preview — HTML only. */
export function renderInvitePreview(input: InviteRenderInput): string {
    return renderInvite(input).html;
}

// ── Co-host invitation (shop → shop) ───────────────────────────────────
// Sent from the HOST shop to a prospective CO-HOST shop's inbox. Shares the
// HUD skeleton so the whole invitation family reads as one system.

export interface CoHostInviteInput {
    hostBranding: InviteBranding;
    coHostName: string;
    event: InviteEvent;
    /** Where the co-host manages the invite (their dashboard events list). */
    manageUrl: string;
    baseUrl?: string;
}

export function renderCoHostInvite(input: CoHostInviteInput): RenderedInvite {
    const b = input.hostBranding;
    const ev = input.event;
    const accent = safeColor(b.primaryColor, '#e8a845');
    const when = formatEventDateTime(ev.startAtISO);
    const where = [ev.locationName, ev.locationDetail].filter(Boolean).join(' · ') || 'Location TBA';
    const subject = `${b.fromName} invited ${input.coHostName} to co-host ${ev.title}`;
    const row = (label: string, value: string) =>
        `<tr><td style="padding:9px 0;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:10px;letter-spacing:2px;color:#8a8a9a;text-transform:uppercase;width:96px;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:9px 0;font-size:14px;color:#f0f0f0;line-height:1.5;">${escapeHtml(value)}</td></tr>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#050508;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#f0f0f0;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#050508;padding:36px 16px;"><tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0" style="max-width:540px;width:100%;">
  <tr><td align="center" style="padding-bottom:18px;">${logoMark(b, accent, 'center')}<div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:9px;letter-spacing:4px;color:#8a8a9a;margin-top:8px;">CO-HOST INVITATION</div></td></tr>
  <tr><td style="background:#0c0c14;border:1px solid #1a1a28;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:26px 28px 6px;"><div style="display:inline-block;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:9px;letter-spacing:3px;color:#050508;background:${accent};padding:5px 10px;">${escapeHtml(ev.typeLabel.toUpperCase())}</div></td></tr>
      <tr><td style="padding:10px 28px 2px;"><p style="margin:0;font-size:14px;color:#b5b5b5;line-height:1.55;"><b style="color:#f0f0f0;">${escapeHtml(b.fromName)}</b> invited <b style="color:#f0f0f0;">${escapeHtml(input.coHostName)}</b> to co-host:</p></td></tr>
      <tr><td style="padding:6px 28px 4px;"><h1 style="margin:0;font-size:24px;font-weight:800;letter-spacing:0.5px;color:#f0f0f0;line-height:1.15;">${escapeHtml(ev.title)}</h1></td></tr>
      <tr><td style="padding:12px 28px 4px;"><table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #2a2a3a;border-bottom:1px solid #2a2a3a;">${row('When', when)}${row('Where', where)}</table></td></tr>
      <tr><td style="padding:16px 28px 2px;"><p style="margin:0;font-size:13px;color:#b5b5b5;line-height:1.6;">Accept to add this event to your dashboard — then you can invite your own customers to ride along under your brand.</p></td></tr>
      <tr><td style="height:20px;"></td></tr>
      <tr><td align="center" style="padding:0 28px;"><table cellpadding="0" cellspacing="0"><tr><td align="center" style="background:${accent};"><a href="${escapeHtml(input.manageUrl)}" style="display:inline-block;padding:15px 40px;color:#050508;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:12px;font-weight:700;text-decoration:none;letter-spacing:3px;">REVIEW & RESPOND ›</a></td></tr></table></td></tr>
      <tr><td style="height:28px;"></td></tr>
    </table>
  </td></tr>
  <tr><td align="center" style="padding-top:16px;"><p style="margin:0;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:9px;letter-spacing:2px;color:#5a5a6e;">SENT BY ROLLOUT ON BEHALF OF ${escapeHtml(b.shopName.toUpperCase())}</p></td></tr>
</table>
</td></tr></table>
</body></html>`;
    return { subject, html };
}
