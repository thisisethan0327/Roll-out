/**
 * Shared parsing/shaping for `rollout.events.route_plan` (migration
 * `20260921_076_event_route_plan.sql`) — the host-planned itinerary for the
 * /event/[id] ROUTE PREVIEW. Mirrors `mobile-route-plan/src/data/routePlan.ts`'s
 * `jsonToStops` shape (`{seq, kind, name, lat, lng, dwell_min?, eta_local?,
 * note?}`) so the web + mobile readers agree on what a stop looks like.
 *
 * `event_cards` (migration 070) does NOT carry `route_plan` — read `events`
 * directly, same as the mobile app.
 */

export type RoutePlanStop = {
    seq: number;
    kind: string;
    name: string;
    lat: number;
    lng: number;
    etaLocal: string | null;
    dwellMin: number | null;
    note: string | null;
};

/** `events.route_plan` (jsonb array, or null) -> sorted, validated stops. Any
 * entry missing usable coordinates is dropped rather than breaking the whole
 * route — a bad stop should not take the map down. */
export function parseRoutePlan(raw: unknown): RoutePlanStop[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((entry: any): RoutePlanStop | null => {
            const lat = Number(entry?.lat);
            const lng = Number(entry?.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            const dwellRaw = Number(entry?.dwell_min);
            return {
                seq: Number.isFinite(Number(entry?.seq)) ? Number(entry.seq) : 0,
                kind: typeof entry?.kind === 'string' && entry.kind ? entry.kind : 'stop',
                name: typeof entry?.name === 'string' && entry.name ? entry.name : 'Stop',
                lat,
                lng,
                etaLocal: typeof entry?.eta_local === 'string' && entry.eta_local ? entry.eta_local : null,
                dwellMin: Number.isFinite(dwellRaw) ? dwellRaw : null,
                note: typeof entry?.note === 'string' && entry.note ? entry.note : null,
            };
        })
        .filter((s): s is RoutePlanStop => s !== null)
        .sort((a, b) => a.seq - b.seq);
}

/** One point on the drawn route — the synthesized START/DESTINATION plus the
 * planned stops, in travel order. `label` is the map-pin caption: 'START' /
 * 'DEST' for the terminals, the 1-based stop index (as a string) otherwise —
 * NOT the raw `seq` value (seq is host-authored spacing like 10/20/30, not a
 * 1..N sequence). */
export type RoutePoint = {
    kind: 'start' | 'stop' | 'destination';
    label: string;
    name: string;
    lat: number;
    lng: number;
};

export function buildRoutePoints(args: {
    startLat: number | null | undefined;
    startLng: number | null | undefined;
    startName: string | null | undefined;
    stops: RoutePlanStop[];
    destLat: number | null | undefined;
    destLng: number | null | undefined;
    destName: string | null | undefined;
}): RoutePoint[] {
    const points: RoutePoint[] = [];
    if (args.startLat != null && args.startLng != null) {
        points.push({ kind: 'start', label: 'START', name: args.startName || 'Start', lat: args.startLat, lng: args.startLng });
    }
    // Defensively re-sort by seq even though parseRoutePlan's caller already
    // sorted `args.stops` — this is the ONE place that assigns the 1..N pin
    // labels the map and the itinerary list both key off of, so a future
    // caller that hands in an unsorted (or eta_local-sorted) array must not
    // silently scramble the numbering. `eta_local` is host-typed free text
    // and is NOT authoritative for order — `seq` is (see this file's header
    // comment); a plan can legitimately have eta_local values that read
    // out of chronological order (a host's estimate was off) while seq
    // stays the correct planned sequence.
    const orderedStops = [...args.stops].sort((a, b) => a.seq - b.seq);
    orderedStops.forEach((s, i) => {
        points.push({ kind: 'stop', label: String(i + 1), name: s.name, lat: s.lat, lng: s.lng });
    });
    if (args.destLat != null && args.destLng != null) {
        points.push({ kind: 'destination', label: 'DEST', name: args.destName || 'Destination', lat: args.destLat, lng: args.destLng });
    }
    return points;
}

/**
 * Multi-stop Google Maps directions URL. Google's public "Directions URL"
 * (`api=1`) accepts a `waypoints` list but caps it in practice around 9 stops
 * — beyond that the link silently drops or errors. Rather than guess at the
 * exact server-side limit, we truncate defensively at 9 intermediate stops,
 * always keeping the ORIGIN and DESTINATION (dropping excess from the END of
 * the middle stops, i.e. the stops closest to the destination) and returning
 * whether a truncation happened so the caller can say so in the UI/comment.
 */
const GOOGLE_MAPS_MAX_WAYPOINTS = 9;

export function buildGoogleMapsDirUrl(points: RoutePoint[]): { url: string; truncated: boolean } | null {
    if (points.length < 2) return null;
    const origin = points[0];
    const destination = points[points.length - 1];
    const middle = points.slice(1, -1);
    const truncated = middle.length > GOOGLE_MAPS_MAX_WAYPOINTS;
    // Truncate from the end (drop the stops nearest the destination) so the
    // link still traces the start of the planned route rather than jumping
    // straight from origin to a mid-route stop.
    const waypoints = truncated ? middle.slice(0, GOOGLE_MAPS_MAX_WAYPOINTS) : middle;

    const params = new URLSearchParams({
        api: '1',
        origin: `${origin.lat},${origin.lng}`,
        destination: `${destination.lat},${destination.lng}`,
        travelmode: 'driving',
    });
    if (waypoints.length > 0) {
        params.set('waypoints', waypoints.map((p) => `${p.lat},${p.lng}`).join('|'));
    }
    return { url: `https://www.google.com/maps/dir/?${params.toString()}`, truncated };
}
