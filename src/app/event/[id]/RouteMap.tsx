'use client';
/**
 * ROUTE PREVIEW map (event page) — pure MapLibre GL JS from the same unpkg
 * CDN version + OpenFreeMap dark style `src/app/meets/map/MeetsMap.tsx`
 * uses, but WITHOUT Leaflet: MeetsMap reaches for Leaflet because its
 * shop/event pins need Leaflet's popup system across a country-wide map.
 * This map only needs numbered stop markers + a fitted line, both native to
 * maplibre-gl, so carrying Leaflet + the maplibre-gl-leaflet bridge here
 * would be dead weight for zero benefit. Same CDN version, same style URL,
 * same dark chrome (rl-map-loading placeholder) — a second surface, not a
 * second design.
 *
 * `points`/`polyline` are computed SERVER-SIDE in page.tsx (route-plan.ts,
 * route-osrm.ts) and handed down as plain, JSON-serialisable props — this
 * file never talks to Supabase or OSRM itself.
 */
import { useEffect, useRef, useState } from 'react';
import type { RoutePoint } from '@/lib/route-plan';

const MAPLIBRE_CSS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
const MAPLIBRE_JS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';

/** Dark in both themes — see MeetsMap.tsx's header comment: OpenFreeMap's
 * light 'positron' style fought the black/gold palette, so both themes here
 * resolve to the same dark style rather than branching for no visual gain. */
const BASEMAP_STYLE = 'https://tiles.openfreemap.org/styles/dark';
const BASEMAP_ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> &middot; <a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a>';

function loadCss(href: string) {
    if (!document.querySelector(`link[href="${href}"]`)) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    }
}

/** Load a script once; a second caller waits on the in-flight tag. */
function loadScript(src: string, marker: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[data-${marker}]`) as HTMLScriptElement | null;
        if (existing) {
            if (existing.dataset.loaded === '1') return resolve();
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', reject);
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.setAttribute(`data-${marker}`, '1');
        script.addEventListener('load', () => {
            script.dataset.loaded = '1';
            resolve();
        });
        script.addEventListener('error', reject);
        document.body.appendChild(script);
    });
}

async function loadMapLibre(): Promise<any> {
    loadCss(MAPLIBRE_CSS);
    if (!(window as any).maplibregl) {
        await loadScript(MAPLIBRE_JS, 'maplibre-route');
    }
    return (window as any).maplibregl;
}

/** S(tart) / F(inish) / the 1-based stop number — matches the itinerary list
 * beside the map (both read `RoutePoint.label`, set by buildRoutePoints). */
function pinLabel(p: RoutePoint): string {
    if (p.kind === 'start') return 'S';
    if (p.kind === 'destination') return 'F';
    return p.label;
}

export default function RouteMap({
    points,
    polyline,
}: {
    points: RoutePoint[];
    /** [lat, lng] pairs in travel order — OSRM's geometry, or the straight-line
     * fallback through the same points (route-osrm.ts). */
    polyline: [number, number][];
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;

        loadMapLibre()
            .then((maplibregl) => {
                if (cancelled || !containerRef.current || mapRef.current) return;

                const map = new maplibregl.Map({
                    container: containerRef.current,
                    style: BASEMAP_STYLE,
                    attributionControl: false,
                    scrollZoom: false,
                    dragRotate: false,
                    pitchWithRotate: false,
                });
                mapRef.current = map;
                map.addControl(
                    new maplibregl.AttributionControl({ compact: true, customAttribution: BASEMAP_ATTRIBUTION }),
                    'bottom-right',
                );
                map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
                map.touchZoomRotate?.disableRotation?.();

                const paintRoute = () => {
                    if (cancelled || !mapRef.current) return;
                    if (polyline.length >= 2 && !map.getSource('route-line')) {
                        map.addSource('route-line', {
                            type: 'geojson',
                            data: {
                                type: 'Feature',
                                properties: {},
                                geometry: {
                                    type: 'LineString',
                                    // GeoJSON order is [lng, lat] — the props arrive [lat, lng].
                                    coordinates: polyline.map(([lat, lng]) => [lng, lat]),
                                },
                            },
                        });
                        map.addLayer({
                            id: 'route-line-glow',
                            type: 'line',
                            source: 'route-line',
                            layout: { 'line-join': 'round', 'line-cap': 'round' },
                            paint: { 'line-color': '#ffb733', 'line-width': 9, 'line-opacity': 0.16 },
                        });
                        map.addLayer({
                            id: 'route-line',
                            type: 'line',
                            source: 'route-line',
                            layout: { 'line-join': 'round', 'line-cap': 'round' },
                            paint: { 'line-color': '#ffb733', 'line-width': 3 },
                        });
                    }
                };

                if (map.isStyleLoaded?.()) paintRoute();
                map.on('load', () => {
                    paintRoute();
                    if (!cancelled) setReady(true);
                });
                // Fallback readiness, same backstop MeetsMap.tsx uses — never leave
                // the placeholder up forever if 'load' doesn't fire.
                setTimeout(() => {
                    if (!cancelled) setReady(true);
                }, 2500);

                const bounds = new maplibregl.LngLatBounds();
                for (const p of points) {
                    const el = document.createElement('div');
                    el.className = `rl-route-pin rl-route-pin-${p.kind}`;
                    el.textContent = pinLabel(p);
                    el.title = p.name;
                    new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(map);
                    bounds.extend([p.lng, p.lat]);
                }
                for (const [lat, lng] of polyline) bounds.extend([lng, lat]);
                if (!bounds.isEmpty()) {
                    map.fitBounds(bounds, { padding: 44, maxZoom: 15, duration: 0 });
                }

                // Sticky/grid containers can measure 0 on first paint; correct it.
                setTimeout(() => {
                    if (!cancelled) mapRef.current?.resize();
                }, 60);

                // Re-enable wheel zoom only after a click so the page still scrolls.
                map.on('click', () => map.scrollZoom.enable());
                map.getContainer().addEventListener('mouseleave', () => map.scrollZoom.disable());
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
            });

        return () => {
            cancelled = true;
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, [points, polyline]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', background: 'var(--bg-2)' }}>
            <div ref={containerRef} style={{ position: 'absolute', inset: 0, zIndex: 1 }} />
            {!ready && !failed ? (
                <div className="rl-map-loading">
                    <div className="rl-map-inner">
                        <div className="rl-map-grid" />
                        <span className="rl-skel-eyebrow">
                            LOADING MAP
                            <span className="rl-dots" aria-hidden="true">
                                <i /><i /><i />
                            </span>
                        </span>
                    </div>
                </div>
            ) : null}
            {failed ? (
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'grid',
                        placeItems: 'center',
                        color: 'var(--text-2)',
                        zIndex: 2,
                        textAlign: 'center',
                        padding: 24,
                    }}
                >
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: 'var(--track-wider)' }}>
                        MAP UNAVAILABLE · CHECK CONNECTION
                    </div>
                </div>
            ) : null}
        </div>
    );
}
