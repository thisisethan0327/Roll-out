/**
 * Event times: one instant, one named zone, both ends agreeing.
 *
 * `rollout.events.start_at` is a UTC INSTANT. The composer edits a WALL CLOCK
 * ("2026-09-12T11:00", what a person reads off a poster), which is meaningless
 * without a zone. Run R12 found both ends picking a different one:
 *
 *   write — `new Date(start_at_raw)` on a zoneless string is parsed in the
 *           SERVER's zone, and rollout-web sets no TZ, so the container's UTC.
 *           An admin typing 11:00 AM stored 11:00Z = 4:00 AM PT.
 *   read  — the edit form's pre-fill used getFullYear/getHours in a CLIENT
 *           component, i.e. the BROWSER's zone.
 *
 * So every save moved the meet by the offset between them, compounding on each
 * edit. The exporters were never wrong: /ics and the Google link serialise the
 * stored instant with getUTC* and stay exactly as they are.
 *
 * The fix is not a smarter parse — it is naming the zone and using the SAME one
 * in both directions. The form carries it, these two functions are inverses of
 * each other for that zone, and the round trip is lossless whatever it is.
 *
 * WHICH zone is a product decision (the browser's, or the shop's — a venue's
 * meet arguably happens in the venue's zone) and is deliberately NOT baked in
 * here: callers pass it. Switching later changes the caller, not this file.
 */

/** Zoneless wall clock as `<input type="datetime-local">` exchanges it. */
const WALL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * How far `timeZone` is from UTC at a given instant, in ms. Positive east.
 *
 * Reads the parts back out of Intl for that zone and re-reads them AS IF they
 * were UTC; the difference is the offset in force at that instant, so DST is
 * whatever the zone database says rather than anything we compute.
 */
function zoneOffsetMs(instantMs: number, timeZone: string): number {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
    const p: Record<string, string> = {};
    for (const part of dtf.formatToParts(new Date(instantMs))) p[part.type] = part.value;
    // hour can come back as "24" at midnight in some ICU versions.
    const hour = Number(p.hour) % 24;
    const asIfUtc = Date.UTC(
        Number(p.year),
        Number(p.month) - 1,
        Number(p.day),
        hour,
        Number(p.minute),
        Number(p.second),
    );
    return asIfUtc - instantMs;
}

/** True when `tz` is a zone this runtime actually knows. */
export function isValidTimeZone(tz: string | null | undefined): boolean {
    if (!tz || typeof tz !== 'string') return false;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
    } catch {
        return false;
    }
}

/**
 * A zone we are willing to act on, or UTC.
 *
 * UTC is the fallback because it is what the server already did — a missing
 * zone must not silently move anyone's meet to a NEW wrong time on top of the
 * old one. It is not a good answer, just an unchanged one, so callers log it.
 */
export function resolveFormZone(raw: unknown): { timeZone: string; supplied: boolean } {
    const tz = typeof raw === 'string' ? raw.trim() : '';
    if (isValidTimeZone(tz)) return { timeZone: tz, supplied: true };
    return { timeZone: 'UTC', supplied: false };
}

/**
 * Wall clock in `timeZone` -> the UTC instant. Inverse of utcToZonedWallClock.
 *
 * Two passes: guess the instant using the offset at the wall clock read as UTC,
 * then re-read the offset AT that instant and correct if the guess landed on
 * the other side of a DST change. Returns null for input we cannot trust rather
 * than an Invalid Date that would reach the database as null.
 */
export function zonedWallClockToUtc(wall: string, timeZone: string): Date | null {
    const m = WALL_RE.exec((wall ?? '').trim());
    if (!m) return null;
    const [, y, mo, d, h, mi, s] = m;
    const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';

    const wallAsUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, s ? +s : 0);
    if (!Number.isFinite(wallAsUtc)) return null;

    const firstGuess = wallAsUtc - zoneOffsetMs(wallAsUtc, zone);
    const corrected = wallAsUtc - zoneOffsetMs(firstGuess, zone);
    const out = new Date(corrected);
    return Number.isNaN(out.getTime()) ? null : out;
}

/**
 * UTC instant -> wall clock in `timeZone`, shaped for datetime-local.
 * Inverse of zonedWallClockToUtc.
 */
export function utcToZonedWallClock(iso: string | Date | null | undefined, timeZone: string): string {
    if (!iso) return '';
    const d = iso instanceof Date ? iso : new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
    const shifted = new Date(d.getTime() + zoneOffsetMs(d.getTime(), zone));
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
        `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}` +
        `T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`
    );
}

/** The viewer's own zone, for the hidden field. 'UTC' where there is no Intl. */
export function browserTimeZone(): string {
    try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return isValidTimeZone(tz) ? tz : 'UTC';
    } catch {
        return 'UTC';
    }
}

/** Name of the hidden form field carrying the zone. One spelling, one place. */
export const EVENT_TZ_FIELD = 'start_at_tz';

/**
 * ZONES. An event is rendered in ITS OWN zone with that zone's label ("PDT",
 * "EDT"), never in a platform-wide one — Rollout is not a Seattle product. The
 * zone comes from the event row (`time_zone`, written by the composer from the
 * hidden start_at_tz field); rows from before the column existed fall back to
 * DEFAULT_EVENT_TIME_ZONE, which is where every meet was hosted until then.
 *
 * PLATFORM_TIME_ZONE is for timestamps that belong to no event and no viewer
 * a server component can see (order dates in a shop console, a review's date,
 * an invoice): the tenants' zone until rollout.shops carries an IANA column.
 */
export const DEFAULT_EVENT_TIME_ZONE = 'America/Los_Angeles';
export const PLATFORM_TIME_ZONE = 'America/Los_Angeles';

/** "PDT" / "PST" / "EDT" — the zone's short name AT that instant. */
export function zoneLabel(timeZone: string, at: Date): string {
    try {
        const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
            .formatToParts(at)
            .find((x) => x.type === 'timeZoneName');
        return part?.value ?? timeZone;
    } catch {
        return timeZone;
    }
}

function asDate(iso: string | Date | null | undefined): Date | null {
    if (!iso) return null;
    const d = iso instanceof Date ? iso : new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
}

function zoneOf(tz: string | null | undefined, fallback: string): string {
    return tz && isValidTimeZone(tz) ? tz : fallback;
}

/** "Sat, Sep 12, 11:00 AM PDT" — the public event shape, in the event's zone. */
export function formatEventTime(iso: string | Date | null | undefined, timeZone?: string | null): string {
    const d = asDate(iso);
    if (!d) return 'Date TBA';
    const tz = zoneOf(timeZone, DEFAULT_EVENT_TIME_ZONE);
    return (
        d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz }) +
        ' ' + zoneLabel(tz, d)
    );
}

/** "2:47 PM PDT" — a time of day, for a hold that expires today. */
export function formatClock(iso: string | Date | null | undefined, timeZone?: string | null): string {
    const d = asDate(iso);
    if (!d) return '';
    const tz = zoneOf(timeZone, DEFAULT_EVENT_TIME_ZONE);
    return d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz }) + ' ' + zoneLabel(tz, d);
}

/** "SAT SEP 12 · 11AM PDT" — the profile page's stamp register. */
export function formatEventStamp(iso: string | Date | null | undefined, timeZone?: string | null): string {
    const d = asDate(iso);
    if (!d) return '';
    const tz = zoneOf(timeZone, DEFAULT_EVENT_TIME_ZONE);
    const dow = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: tz }).toUpperCase();
    const mon = d.toLocaleDateString('en-US', { month: 'short', timeZone: tz }).toUpperCase();
    const day = d.toLocaleDateString('en-US', { day: 'numeric', timeZone: tz });
    const hour = d.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true, timeZone: tz }).replace(/\s/g, '').toUpperCase();
    return `${dow} ${mon} ${day} · ${hour} ${zoneLabel(tz, d)}`;
}

/** "Sep 12, 2026, 11:00 AM PDT" — a dated timestamp (orders, /me), platform zone. */
export function formatDateTime(iso: string | Date | null | undefined): string {
    const d = asDate(iso);
    if (!d) return '—';
    return (
        d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: PLATFORM_TIME_ZONE }) +
        ' ' + zoneLabel(PLATFORM_TIME_ZONE, d)
    );
}

/** "Sep 12, 2026" (short) or "September 12, 2026" (long) — a date, platform zone. */
export function formatDateOnly(iso: string | Date | null | undefined, month: 'short' | 'long' = 'short'): string {
    const d = asDate(iso);
    if (!d) return '';
    return d.toLocaleDateString('en-US', { year: 'numeric', month, day: 'numeric', timeZone: PLATFORM_TIME_ZONE });
}

