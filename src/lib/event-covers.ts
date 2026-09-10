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
 * Default covers ship WITH the site (public/covers, two ratios) instead of the
 * event-covers bucket: re-shot in the gold register (UI polish §3), and a 4:5
 * variant for the portrait thumbs. Auto (unpinned) events resolve at render
 * time, so this re-brands every unpinned event at once. Events that pinned a
 * bucket URL keep it — the bucket is untouched.
 */
export const COVER_BASE = '/covers';
export type CoverRatio = '16x9' | '4x5';
/** A picked default is PINNED as an absolute URL, so the phone app can load it too. */
export const COVER_PUBLIC_ORIGIN = 'https://rollout.club';
export function publicCoverUrl(path: string): string {
    return path.startsWith('/') ? COVER_PUBLIC_ORIGIN + path : path;
}
function cover(type: string, n: 1 | 2, ratio: CoverRatio = '16x9'): string {
    return `${COVER_BASE}/${type}-${n}-${ratio}.webp`;
}
/** Swap the ratio of one of OUR default paths/urls; anything else is returned as-is. */
export function coverAtRatio(url: string, ratio: CoverRatio): string {
    const m = url.match(/^(https?:\/\/rollout\.club)?\/covers\/([A-Z_]+-[12])-(16x9|4x5)\.webp$/);
    return m ? `${m[1] ?? ''}${COVER_BASE}/${m[2]}-${ratio}.webp` : url;
}

export const EVENT_COVER_TYPES = [
    'CAR_MEET',
    'NIGHT_RUN',
    'TRACK_DAY',
    'CRUISE',
    'SHOW',
] as const;

export type EventCoverType = (typeof EVENT_COVER_TYPES)[number];

/** type → [variant1, variant2] public URLs. */
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

/** Resolve the cover to display: pinned URL if present, else deterministic default. */
export function resolveCover(
    heroImageUrl: string | null | undefined,
    type: string | null | undefined,
    seed: string | null | undefined,
    ratio: CoverRatio = '16x9',
): string {
    const pinned = heroImageUrl && heroImageUrl.trim().length > 0 ? heroImageUrl.trim() : null;
    // A pinned default of ours follows the ratio too; a custom or bucket URL is used as-is.
    return pinned ? coverAtRatio(pinned, ratio) : coverAtRatio(defaultCoverFor(type, seed), ratio);
}
