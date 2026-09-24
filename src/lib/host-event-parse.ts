/**
 * Pure form-field parsers shared by src/app/me/events/actions.ts
 * (createHostEvent / updateHostEvent).
 *
 * Pulled out of actions.ts rather than exported from it: a `'use server'`
 * file may only export async functions, so these validate-don't-throw
 * helpers — plain sync functions — have to live in an ordinary module. This
 * also makes them importable from a standalone Node script for a quick
 * sanity check without booting Next.
 *
 * Each returns a ParseResult instead of throwing: Next.js redacts messages
 * thrown from server actions in production, so a thrown `new Error('...')`
 * for something as ordinary as "name too long" reached the user as a
 * generic failure. Returning `{ ok: false, error }` lets the action hand
 * the real message back as data.
 */

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** `destination_name` — trimmed, optional (null clears it). Same 1..80-char
 * cap the route_plan stop names carry (migration 076), for consistency. */
export function parseDestinationName(raw: FormDataEntryValue | null): ParseResult<string | null> {
    if (raw == null) return { ok: true, value: null };
    const s = String(raw).trim();
    if (!s) return { ok: true, value: null };
    if (s.length > 80) return { ok: false, error: 'Destination name must be 80 characters or fewer.' };
    return { ok: true, value: s };
}

/** `hero_image_url` — trimmed, optional (null clears it). Must be an
 * http(s) link and reasonably short. */
export function parseHeroUrl(raw: FormDataEntryValue | null): ParseResult<string | null> {
    if (raw == null) return { ok: true, value: null };
    const s = String(raw).trim();
    if (!s) return { ok: true, value: null };
    if (!/^https?:\/\//i.test(s)) return { ok: false, error: 'Cover URL must be an http(s) link.' };
    if (s.length > 1000) return { ok: false, error: 'Cover URL is too long.' };
    return { ok: true, value: s };
}
