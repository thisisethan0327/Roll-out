/**
 * Shared Nominatim geocoding helper.
 *
 * Extracted from the verifications approve flow so every path that needs to
 * resolve a shop's coordinates — verification approval, the shop-side general
 * settings save, and the admin shop-profile editor — uses one implementation.
 *
 * Everything here is FAILURE-TOLERANT: `geocode` returns null on any error,
 * timeout, or empty result and never throws, so callers can treat a miss as
 * "no coordinates" without a try/catch. Nominatim etiquette (a descriptive
 * User-Agent + a short timeout) lives here in one place.
 */
import 'server-only';

export type LatLng = { lat: number; lng: number };

export type LocationPrecision = 'exact' | 'area' | 'off';

export const LOCATION_PRECISIONS: readonly LocationPrecision[] = [
    'exact',
    'area',
    'off',
] as const;

export function isLocationPrecision(v: unknown): v is LocationPrecision {
    return typeof v === 'string' && (LOCATION_PRECISIONS as readonly string[]).includes(v);
}

export type ShopLocationInput = {
    address_line?: string | null;
    city?: string | null;
    state_region?: string | null;
    postal?: string | null;
};

/**
 * Build the Nominatim query for a shop given its precision:
 *   exact → full street address ("<line>, <city>, <state>, <postal>")
 *   area  → city centroid only ("<city>, <state>")
 *   off   → null (nothing to geocode; the shop is not on the map)
 * Returns null when there aren't enough parts to form a meaningful query.
 */
export function buildGeocodeQuery(
    loc: ShopLocationInput,
    precision: LocationPrecision,
): string | null {
    if (precision === 'off') return null;

    const clean = (v: unknown) => (v ?? '').toString().trim();

    const parts =
        precision === 'area'
            ? [clean(loc.city), clean(loc.state_region)]
            : [
                  clean(loc.address_line),
                  clean(loc.city),
                  clean(loc.state_region),
                  clean(loc.postal),
              ];

    const usable = parts.filter(Boolean);
    return usable.length > 0 ? usable.join(', ') : null;
}

/**
 * Geocode a free-text query via Nominatim. Returns coordinates on the first
 * usable hit, or null on any failure/timeout/empty result. Never throws.
 */
export async function geocode(query: string): Promise<LatLng | null> {
    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`,
            {
                headers: {
                    'User-Agent': 'rollout.club shop directory (info@neferstock.com)',
                },
                signal: AbortSignal.timeout(5000),
            },
        );
        if (!res.ok) return null;
        const hits = (await res.json()) as Array<{ lat?: string; lon?: string }>;
        const hit = Array.isArray(hits) ? hits[0] : undefined;
        const lat = hit?.lat != null ? Number(hit.lat) : NaN;
        const lng = hit?.lon != null ? Number(hit.lon) : NaN;
        if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
        return null;
    } catch {
        return null;
    }
}
