/**
 * Rollout ban — pure helpers shared by server code and client components.
 * (No server-only import on purpose; the DB-reading half lives in ban-server.ts.)
 *
 * A ban is `rollout.profiles.banned_until` (migration 091): null = not banned,
 * a future timestamp = banned until then, '9999-12-31' = permanent. It is a
 * ROLLOUT-only flag; it never touches auth.users, so EMWRAPS / NeferStock /
 * UNITY sign-in is unaffected.
 *
 * Everything here must keep working BEFORE 091 is applied: a missing column,
 * table or RPC is treated as "nobody is banned", never as an error.
 */

/** The one string a suspended member ever sees as the reason an action failed. */
export const SUSPENDED_MESSAGE = 'Your account is suspended.';

/** Machine code the mobile app and JSON routes use for the same condition. */
export const SUSPENDED_CODE = 'account_suspended';

/** Support address on the /suspended page. */
export const SUPPORT_EMAIL = 'support@rollout.club';

/** What "permanent" is stored as. 'infinity' is avoided: PostgREST/JS can't round-trip it. */
export const PERMANENT_BAN_UNTIL = '9999-12-31T00:00:00Z';

/**
 * PostgREST / Postgres codes that mean "migration 091 is not applied":
 * 42703 undefined column, PGRST204 column not in schema cache, 42883 undefined
 * function, PGRST202 function not in schema cache, 42P01 undefined table,
 * PGRST205 table not in schema cache.
 */
const MISSING_SCHEMA_CODES = new Set(['42703', 'PGRST204', '42883', 'PGRST202', '42P01', 'PGRST205']);

/** True when `err` says the ban column / table / RPC does not exist yet. */
export function isBanSchemaMissing(err: { code?: string | null } | null | undefined): boolean {
    return !!err?.code && MISSING_SCHEMA_CODES.has(String(err.code));
}

/** True while `until` is in the future. null/undefined/invalid/past = not banned. */
export function isBannedUntil(until: string | null | undefined, now: number = Date.now()): boolean {
    if (!until) return false;
    const t = new Date(until).getTime();
    return Number.isFinite(t) && t > now;
}

/** True for a ban with no end (year 9999). */
export function isPermanentBan(until: string | null | undefined): boolean {
    if (!until) return false;
    const t = new Date(until);
    return Number.isFinite(t.getTime()) && t.getUTCFullYear() >= 9999;
}

/** "permanently" or "until Oct 8, 2026" — sentence-ready, UTC so server and client agree. */
export function describeBanEnd(until: string | null | undefined): string {
    if (!until) return '';
    if (isPermanentBan(until)) return 'permanently';
    const d = new Date(until);
    if (!Number.isFinite(d.getTime())) return '';
    const date = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
    return `until ${date} (UTC)`;
}

/** True when a Supabase/PostgREST error is the DB's 'account_suspended' refusal. */
export function isSuspendedError(
    err: { message?: string | null; hint?: string | null; details?: string | null } | null | undefined,
): boolean {
    if (!err) return false;
    const text = `${err.message ?? ''} ${err.hint ?? ''} ${err.details ?? ''}`;
    return /account[_ ]suspended/i.test(text);
}

/** The friendly text for a failed member call: the suspension message when that is the cause, else `fallback`. */
export function friendlyDbError(
    err: { message?: string | null; hint?: string | null; details?: string | null } | null | undefined,
    fallback: string,
): string {
    return isSuspendedError(err) ? SUSPENDED_MESSAGE : fallback;
}

/** Anything with a bannedUntil (ConsumerProfile, AppCaller.profile…). */
export function isProfileBanned(p: { bannedUntil?: string | null } | null | undefined): boolean {
    return !!p && isBannedUntil(p.bannedUntil);
}

// ── Part 2 (migration 093): refund policy, tickets and appeals ──────────────

/** Business days a human has to decide an appeal (Ethan 2026-10-09). */
export const APPEAL_BUSINESS_DAYS = 5;

/** Appeal text bounds, mirrored from the DB check (btrim length 20..2000). */
export const APPEAL_MIN = 20;
export const APPEAL_MAX = 2000;

/**
 * Release a permanently banned member's FREE upcoming RSVPs too (Ethan 2026-10-09,
 * "keep a single constant, default ON"). Read by lib/ban-refunds.ts only.
 */
export const RELEASE_FREE_RSVPS_ON_PERMANENT_BAN = true;

/** The one sentence a member sees when a refund row failed. Never the raw error. */
export const REFUND_FAILED_PUBLIC = 'Refund pending — support is handling it';

export type BanRefundMode = 'auto' | 'on_request' | 'withhold';
export type AppealStatus = 'submitted' | 'in_review' | 'upheld' | 'overturned';

export type BanTicket = {
    kind: 'order' | 'seat';
    orderId: string | null;
    ticketId: string | null;
    eventId: string | null;
    eventTitle: string | null;
    startAt: string | null;
    amountCents: number;
    /** pending | requested | refunding | refunded | failed | withheld | declined | skipped | kept */
    refundStatus: string;
    refundCents: number | null;
    requestedAt: string | null;
    errorPublic: string | null;
};

export type MyBan = {
    bannedUntil: string | null;
    publicNote: string | null;
    banId: string | null;
    bannedAt: string | null;
    isPermanent: boolean;
    refundMode: BanRefundMode | null;
    appeal: {
        id: string;
        status: AppealStatus;
        createdAt: string | null;
        decidedAt: string | null;
        decisionPublicNote: string | null;
    } | null;
    tickets: BanTicket[];
    /** false = the pre-093 two-field shape (no appeals, no ticket block). */
    extended: boolean;
};

/**
 * Parse rollout.my_ban() (091 shape: {banned_until, public_note}; 093 shape adds
 * ban_id, refund_mode, appeal, tickets). null/unbanned -> null.
 */
export function parseMyBan(raw: unknown): MyBan | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, any>;
    const bannedUntil = (r.banned_until ?? null) as string | null;
    if (!isBannedUntil(bannedUntil)) return null;
    const extended = 'ban_id' in r || 'appeal' in r || 'tickets' in r || 'refund_mode' in r;
    const mode = r.refund_mode;
    const a = r.appeal;
    return {
        bannedUntil,
        publicNote: (r.public_note ?? null) as string | null,
        banId: (r.ban_id ?? null) as string | null,
        bannedAt: (r.banned_at ?? null) as string | null,
        isPermanent: typeof r.is_permanent === 'boolean' ? r.is_permanent : isPermanentBan(bannedUntil),
        refundMode: mode === 'auto' || mode === 'on_request' || mode === 'withhold' ? mode : null,
        appeal:
            a && typeof a === 'object' && a.id
                ? {
                      id: String(a.id),
                      status: a.status as AppealStatus,
                      createdAt: a.created_at ?? null,
                      decidedAt: a.decided_at ?? null,
                      decisionPublicNote: a.decision_public_note ?? null,
                  }
                : null,
        tickets: Array.isArray(r.tickets)
            ? r.tickets.map((t: any) => ({
                  kind: t.kind === 'seat' ? 'seat' : 'order',
                  orderId: t.order_id ?? null,
                  ticketId: t.ticket_id ?? null,
                  eventId: t.event_id ?? null,
                  eventTitle: t.event_title ?? null,
                  startAt: t.start_at ?? null,
                  amountCents: Number(t.amount_cents ?? 0),
                  refundStatus: String(t.refund_status ?? 'kept'),
                  refundCents: t.refund_cents != null ? Number(t.refund_cents) : null,
                  requestedAt: t.requested_at ?? null,
                  errorPublic: t.error_public ?? null,
              }))
            : [],
        extended,
    };
}

/** Add `days` BUSINESS days (Mon-Fri, UTC) to `from`. */
export function addBusinessDays(from: Date, days: number): Date {
    const d = new Date(from.getTime());
    let left = days;
    while (left > 0) {
        d.setUTCDate(d.getUTCDate() + 1);
        const dow = d.getUTCDay();
        if (dow !== 0 && dow !== 6) left--;
    }
    return d;
}
