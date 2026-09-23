import 'server-only';

/**
 * Driving polyline for the ROUTE PREVIEW map — one server-side OSRM request
 * per render (Next.js Data Cache dedupes/reuses it for `revalidate` seconds,
 * so this is NOT one request per visitor). Never called from the browser:
 * the public OSRM demo server (router.project-osrm.org) has no CORS/API-key
 * story for that and would be trivial to hammer from client JS.
 *
 * Failure handling is "never break the page": any non-OK response, timeout,
 * malformed body, or thrown error falls back to a straight-line polyline
 * through the same points (still useful — it's what the "as the crow flies"
 * distance looks like) rather than hiding the map or 500ing the page.
 */

export type LatLng = [number, number]; // [lat, lng] — Leaflet's order, not GeoJSON's.

const OSRM_TIMEOUT_MS = 4000;

function toStraightLine(points: LatLng[]): { coords: LatLng[]; source: 'straight' } {
    return { coords: points, source: 'straight' };
}

/**
 * `points` are [lat, lng] in travel order (start -> stops -> destination).
 * Fewer than 2 points can't form a route; callers should not invoke this in
 * that case, but it degrades to a no-op straight "line" (the single point)
 * rather than throwing.
 */
export async function fetchDrivingPolyline(points: LatLng[]): Promise<{ coords: LatLng[]; source: 'osrm' | 'straight' }> {
    if (points.length < 2) return toStraightLine(points);

    const coordStr = points.map(([lat, lng]) => `${lng},${lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            // Next.js Data Cache: one live route plan changes rarely, so an
            // hour-old polyline is fine and saves hammering the public OSRM
            // demo server on every page view.
            next: { revalidate: 3600 },
        });
        if (!res.ok) throw new Error(`OSRM responded ${res.status}`);
        const data: any = await res.json();
        const geometry = data?.routes?.[0]?.geometry?.coordinates;
        if (!Array.isArray(geometry) || geometry.length < 2) throw new Error('OSRM: no route geometry in response');
        const coords: LatLng[] = geometry
            .filter((c: unknown): c is [number, number] => Array.isArray(c) && c.length === 2)
            .map((c: [number, number]) => [c[1], c[0]]);
        if (coords.length < 2) throw new Error('OSRM: unusable route geometry');
        return { coords, source: 'osrm' };
    } catch (err) {
        console.error('[event/[id]] OSRM route fetch failed, falling back to straight line:', (err as Error)?.message ?? err);
        return toStraightLine(points);
    } finally {
        clearTimeout(timeout);
    }
}
