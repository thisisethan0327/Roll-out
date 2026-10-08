/**
 * Shared parse for a member-hosted event edit (updateHostEvent in
 * /me/events/actions.ts AND adminUpdateHostEvent in the admin event page).
 *
 * Pure FormData -> row: no auth, no DB. Callers do their own authorization
 * (host ownership vs platform admin) BEFORE calling this, then run the same
 * writeWithAreaLabel update with their own scoping filters.
 */
import 'server-only';
import { EVENT_TZ_FIELD, resolveFormZone, zonedWallClockToUtc } from '@/lib/event-time';
import { parseDestinationName, parseHeroUrl } from '@/lib/host-event-parse';
import { AREA_LABEL_FIELD, parseAreaLabel } from '@/lib/event-area-label';

export const ALLOWED_HOST_EVENT_VIS = new Set(['public', 'followers', 'private']);

export function parseNumber(raw: FormDataEntryValue | null): number | null {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

export function parseTags(raw: string | null | undefined): string[] {
    if (!raw) return [];
    return raw.split(',').map((t) => t.trim()).filter(Boolean);
}

export type HostEventUpdateParse =
    | { ok: true; row: Record<string, unknown>; area_label: string | null }
    | { ok: false; error: string };

/** Validate + shape the edit form into the events UPDATE payload. */
export function parseHostEventUpdate(formData: FormData): HostEventUpdateParse {
    const title = String(formData.get('title') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim();
    const location_name = String(formData.get('location_name') ?? '').trim();
    const location_detail = String(formData.get('location_detail') ?? '').trim();
    const lat = parseNumber(formData.get('lat'));
    const lng = parseNumber(formData.get('lng'));
    const start_at_raw = String(formData.get('start_at') ?? '').trim();
    const capacity = parseNumber(formData.get('capacity'));
    const visibility = String(formData.get('visibility') ?? 'public').trim();
    const tags = parseTags(String(formData.get('tags') ?? ''));

    const heroResult = parseHeroUrl(formData.get('hero_image_url'));
    if (!heroResult.ok) return { ok: false, error: heroResult.error };
    const hero_image_url = heroResult.value;

    // Route destination (migration 076) — plain columns on events, updated
    // through this same write path (not the route_plan RPC, which only covers
    // the jsonb stop array).
    const destResult = parseDestinationName(formData.get('destination_name'));
    if (!destResult.ok) return { ok: false, error: destResult.error };
    const destination_name = destResult.value;

    const destination_lat = parseNumber(formData.get('destination_lat'));
    const destination_lng = parseNumber(formData.get('destination_lng'));

    // General area for private listings (089); empty clears it to null.
    const areaResult = parseAreaLabel(formData.get(AREA_LABEL_FIELD));
    if (!areaResult.ok) return { ok: false, error: areaResult.error };
    const area_label = areaResult.value;

    if (title.length < 4) return { ok: false, error: 'Title must be at least 4 characters.' };
    if (description.length > 400) return { ok: false, error: 'Description must be 400 chars or fewer.' };
    if (location_name.length < 2) return { ok: false, error: 'Location name is required.' };
    if (!start_at_raw) return { ok: false, error: 'Start time is required.' };
    if (!ALLOWED_HOST_EVENT_VIS.has(visibility)) return { ok: false, error: 'Invalid visibility.' };
    // The wall clock is meaningless without the zone it was typed in; the form
    // carries it. Parsing it with `new Date()` used the SERVER's zone (UTC),
    // which is what moved every meet by the offset. See lib/event-time.ts.
    const { timeZone, supplied } = resolveFormZone(formData.get(EVENT_TZ_FIELD));
    if (!supplied) {
        console.warn('[events] no %s on the form — reading the wall clock as UTC', EVENT_TZ_FIELD);
    }
    const start_at = zonedWallClockToUtc(start_at_raw, timeZone);
    if (!start_at) return { ok: false, error: 'Invalid start time.' };

    return {
        ok: true,
        area_label,
        row: {
            title,
            description: description || null,
            location_name,
            location_detail: location_detail || null,
            lat,
            lng,
            start_at: start_at.toISOString(),
            capacity,
            visibility,
            tags,
            hero_image_url,
            destination_name,
            destination_lat,
            destination_lng,
            updated_at: new Date().toISOString(),
        },
    };
}
