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
