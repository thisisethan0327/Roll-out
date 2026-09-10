/**
 * The drawn map (StylisedMap) is a stylised Puget Sound, not a projection —
 * Tacoma sits east of Seattle on it. Real events are therefore SNAPPED to the
 * nearest drawn site by great-circle distance, and an event farther than
 * SNAP_MAX_KM from every site gets no pin (it is outside the drawn area).
 * Coordinates are in the SVG's 1440×660 viewBox.
 */
export type MapSite = { key: string; x: number; y: number; lat: number; lng: number; label: string };

export const MAP_SITES: MapSite[] = [
    { key: 'seattle', x: 940, y: 462, lat: 47.6062, lng: -122.3321, label: 'Seattle' },
    { key: 'harbor', x: 916, y: 556, lat: 47.5755, lng: -122.3556, label: 'Harbor Island' },
    { key: 'redmond', x: 1092, y: 404, lat: 47.674, lng: -122.1215, label: 'Redmond' },
    { key: 'everett', x: 884, y: 266, lat: 47.9789, lng: -122.2021, label: 'Everett' },
    { key: 'mukilteo', x: 862, y: 298, lat: 47.9445, lng: -122.3046, label: 'Mukilteo' },
    { key: 'clinton', x: 700, y: 300, lat: 47.9754, lng: -122.3524, label: 'Clinton' },
    { key: 'whidbey', x: 596, y: 168, lat: 48.2, lng: -122.6, label: 'Whidbey Island' },
    { key: 'tacoma', x: 960, y: 604, lat: 47.2529, lng: -122.4443, label: 'Tacoma' },
    { key: 'bainbridge', x: 644, y: 470, lat: 47.6262, lng: -122.5212, label: 'Bainbridge' },
];

export const SNAP_MAX_KM = 45;
/** Sites that read as "Seattle" for the drawn route's origin. */
export const SEATTLE_CLUSTER = ['seattle', 'harbor'];
export const ROUTE_ORIGIN = MAP_SITES.find((s) => s.key === 'seattle')!;

function km(aLat: number, aLng: number, bLat: number, bLng: number): number {
    const R = 6371;
    const dLat = ((bLat - aLat) * Math.PI) / 180;
    const dLng = ((bLng - aLng) * Math.PI) / 180;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
}

/** Nearest drawn site, or null when the point is outside the drawn area. */
export function snapToSite(lat: number | null | undefined, lng: number | null | undefined): MapSite | null {
    if (lat == null || lng == null) return null;
    let best: MapSite | null = null;
    let bestKm = Infinity;
    for (const s of MAP_SITES) {
        const d = km(lat, lng, s.lat, s.lng);
        if (d < bestKm) {
            bestKm = d;
            best = s;
        }
    }
    return best && bestKm <= SNAP_MAX_KM ? best : null;
}

/**
 * Whether an event runs the drawn route (The Shop Club → Whidbey). Interim
 * rule until events carry destination_* (migration 058): the meet point snaps
 * to Seattle and the destination — stored, or named in the copy — is Whidbey.
 */
export function hasDrawnRoute(ev: {
    lat: number | null;
    lng: number | null;
    title?: string | null;
    description?: string | null;
    location_detail?: string | null;
    destination_name?: string | null;
}): boolean {
    // The route starts at the Seattle site; a meet point anywhere in the
    // Seattle cluster (The Shop Club snaps to Harbor Island, 1.5 km off) counts.
    const start = snapToSite(ev.lat, ev.lng);
    if (!start || !SEATTLE_CLUSTER.includes(start.key)) return false;
    const dest = (ev.destination_name ?? '').toLowerCase();
    if (dest) return dest.includes('whidbey');
    return /whidbey/i.test(`${ev.title ?? ''} ${ev.location_detail ?? ''} ${ev.description ?? ''}`);
}
