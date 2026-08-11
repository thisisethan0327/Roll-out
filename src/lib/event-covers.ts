/**
 * Default event cover images.
 *
 * Founder-approved hero art (2 variants per event type) lives in the platform
 * Supabase `event-covers` public bucket. Events with no pinned `hero_image_url`
 * fall back to one of these at render time via `defaultCoverFor()`.
 *
 * Because the fallback is resolved at DISPLAY time (not written into the row),
 * re-branding the defaults here — or swapping the bucket files — instantly
 * changes every un-pinned event across the platform. Events whose owner picked
 * a specific cover store that URL in `hero_image_url` and are unaffected.
 */

const BUCKET_BASE =
    'https://sbbxsqvoxrzcgtslspbo.supabase.co/storage/v1/object/public/event-covers';

export const EVENT_COVER_TYPES = [
    'NIGHT_RUN',
    'CAR_MEET',
    'TRACK_DAY',
    'CRUISE',
    'SHOW',
] as const;

export type EventCoverType = (typeof EVENT_COVER_TYPES)[number];

/** type → [variant1, variant2] public URLs. */
export const DEFAULT_EVENT_COVERS: Record<EventCoverType, [string, string]> = {
    NIGHT_RUN: [`${BUCKET_BASE}/NIGHT_RUN-1.webp`, `${BUCKET_BASE}/NIGHT_RUN-2.webp`],
    CAR_MEET: [`${BUCKET_BASE}/CAR_MEET-1.webp`, `${BUCKET_BASE}/CAR_MEET-2.webp`],
    TRACK_DAY: [`${BUCKET_BASE}/TRACK_DAY-1.webp`, `${BUCKET_BASE}/TRACK_DAY-2.webp`],
    CRUISE: [`${BUCKET_BASE}/CRUISE-1.webp`, `${BUCKET_BASE}/CRUISE-2.webp`],
    SHOW: [`${BUCKET_BASE}/SHOW-1.webp`, `${BUCKET_BASE}/SHOW-2.webp`],
};

/** Human labels for the picker UI. */
export const EVENT_COVER_TYPE_LABELS: Record<EventCoverType, string> = {
    NIGHT_RUN: 'Night Run',
    CAR_MEET: 'Car Meet',
    TRACK_DAY: 'Track Day',
    CRUISE: 'Cruise',
    SHOW: 'Show',
};

/** Fallback type when an event's `type` is null / unrecognised. */
const FALLBACK_TYPE: EventCoverType = 'CAR_MEET';

export function isEventCoverType(t: string | null | undefined): t is EventCoverType {
    return !!t && (EVENT_COVER_TYPES as readonly string[]).includes(t);
}

/** FNV-1a 32-bit hash — stable across runtimes, good enough for variant choice. */
function hash32(str: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

/**
 * Deterministic default cover for an event.
 *
 * @param type  event type (e.g. 'NIGHT_RUN'); unknown/null → CAR_MEET art
 * @param seed  stable per-event string (use the event id) so the variant is
 *              consistent for a given event but varies across events
 */
export function defaultCoverFor(
    type: string | null | undefined,
    seed: string | null | undefined,
): string {
    const key: EventCoverType = isEventCoverType(type) ? type : FALLBACK_TYPE;
    const pair = DEFAULT_EVENT_COVERS[key];
    const idx = hash32(seed ?? key) % 2;
    return pair[idx];
}

/** The two default variants for a given type (for the picker's default row). */
export function defaultsForType(type: string | null | undefined): [string, string] {
    const key: EventCoverType = isEventCoverType(type) ? type : FALLBACK_TYPE;
    return DEFAULT_EVENT_COVERS[key];
}

/** Flat list of all covers with metadata (for the picker's "all covers" grid). */
export function allCovers(): { type: EventCoverType; label: string; variant: number; url: string }[] {
    const out: { type: EventCoverType; label: string; variant: number; url: string }[] = [];
    for (const type of EVENT_COVER_TYPES) {
        DEFAULT_EVENT_COVERS[type].forEach((url, i) => {
            out.push({ type, label: EVENT_COVER_TYPE_LABELS[type], variant: i + 1, url });
        });
    }
    return out;
}

/** Resolve the cover to display: pinned URL if present, else deterministic default. */
export function resolveCover(
    heroImageUrl: string | null | undefined,
    type: string | null | undefined,
    seed: string | null | undefined,
): string {
    return heroImageUrl && heroImageUrl.trim().length > 0
        ? heroImageUrl
        : defaultCoverFor(type, seed);
}
