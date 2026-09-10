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

/**
 * Copper Map covers ship WITH the app under /public/covers rather than in the
 * event-covers bucket. Production main reads that bucket, and replacing its
 * ten files would have restyled every un-pinned event live before run 13 —
 * so the branch points here, the bucket keeps the old set until merge, and a
 * pinned hero_image_url (including old bucket URLs the picker saved) still
 * resolves exactly as before. Two ratios: 16:9 for bands and desktop cards,
 * 4:5 for the phone card (run R12 photo lanes cropped the 16:9 badly).
 */
const COVER_BASE = '/covers';
export type CoverRatio = '16x9' | '4x5';

export const EVENT_COVER_TYPES = [
    'NIGHT_RUN',
    'CAR_MEET',
    'TRACK_DAY',
    'CRUISE',
    'SHOW',
] as const;

export type EventCoverType = (typeof EVENT_COVER_TYPES)[number];

/** type → [variant1, variant2] public URLs. */
const cover = (type: string, n: 1 | 2, ratio: CoverRatio = '16x9') => `${COVER_BASE}/${type}-${n}-${ratio}.webp`;

export const DEFAULT_EVENT_COVERS: Record<EventCoverType, [string, string]> = {
    NIGHT_RUN: [cover('NIGHT_RUN', 1), cover('NIGHT_RUN', 2)],
    CAR_MEET: [cover('CAR_MEET', 1), cover('CAR_MEET', 2)],
    TRACK_DAY: [cover('TRACK_DAY', 1), cover('TRACK_DAY', 2)],
    CRUISE: [cover('CRUISE', 1), cover('CRUISE', 2)],
    SHOW: [cover('SHOW', 1), cover('SHOW', 2)],
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

/**
 * Resolve the cover to display: pinned URL if present, else deterministic
 * default. `ratio` picks the 4:5 variant of a DEFAULT cover for phone cards; a
 * pinned URL is returned as-is (we cannot re-crop someone's own photo).
 */
export function resolveCover(
    heroImageUrl: string | null | undefined,
    type: string | null | undefined,
    seed: string | null | undefined,
    ratio: CoverRatio = '16x9',
): string {
    if (heroImageUrl && heroImageUrl.trim().length > 0) return heroImageUrl;
    const url = defaultCoverFor(type, seed);
    return ratio === '4x5' ? url.replace('-16x9.webp', '-4x5.webp') : url;
}
