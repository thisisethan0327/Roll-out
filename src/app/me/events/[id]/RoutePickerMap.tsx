'use client';
/**
 * Click-to-pick coordinate map for the host ROUTE editor (／ ROUTE section,
 * HostEventEditForm.tsx). Same MapLibre GL + OpenFreeMap dark-style CDN load
 * pattern as `src/app/event/[id]/RouteMap.tsx` (see that file's header for
 * why MapLibre alone, no Leaflet) — kept as its own small file rather than
 * bolting a click handler onto RouteMap.tsx, which stays a pure read-only
 * renderer fed by server-computed points/polyline props.
 *
 * Used for two pick targets from RoutePlanEditor.tsx: setting the event
 * destination, and choosing where a new stop goes. The caller owns which
 * target is "active" and what happens on pick; this component only knows
 * how to show one pin and report a click's lat/lng.
 */
import { useEffect, useRef, useState } from 'react';

const MAPLIBRE_CSS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
const MAPLIBRE_JS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
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
        await loadScript(MAPLIBRE_JS, 'maplibre-route-picker');
    }
    return (window as any).maplibregl;
}

/** Seattle — same "reasonable default center" every other picker in this repo
 * falls back to when there is no coordinate yet (shop location pickers etc). */
const FALLBACK_CENTER: [number, number] = [-122.3321, 47.6062];

export default function RoutePickerMap({
    lat,
    lng,
    /** Center to open on when `lat`/`lng` are both null — typically the
     * event's own start coordinates, so a fresh pick starts near the meet. */
    fallbackLat,
    fallbackLng,
    onPick,
    label = 'CLICK THE MAP TO SET A PIN',
}: {
    lat: number | null;
    lng: number | null;
    fallbackLat?: number | null;
    fallbackLng?: number | null;
    onPick: (lat: number, lng: number) => void;
    label?: string;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    const markerRef = useRef<any>(null);
    const onPickRef = useRef(onPick);
    onPickRef.current = onPick;
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(false);

    // Init once. Re-centering/re-marking on lat/lng changes happens in the
    // second effect below rather than re-running this one — tearing the map
    // down on every pick would fight the very click that just fired it.
    useEffect(() => {
        let cancelled = false;

        loadMapLibre()
            .then((maplibregl) => {
                if (cancelled || !containerRef.current || mapRef.current) return;

                const center: [number, number] =
                    lng != null && lat != null
                        ? [lng, lat]
                        : fallbackLng != null && fallbackLat != null
                          ? [fallbackLng, fallbackLat]
                          : FALLBACK_CENTER;

                const map = new maplibregl.Map({
                    container: containerRef.current,
                    style: BASEMAP_STYLE,
                    center,
                    zoom: lat != null && lng != null ? 13 : 10,
                    attributionControl: { compact: true, customAttribution: BASEMAP_ATTRIBUTION },
                    dragRotate: false,
                    pitchWithRotate: false,
                });
                mapRef.current = map;
                map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
                map.touchZoomRotate?.disableRotation?.();

                map.on('load', () => {
                    if (!cancelled) setReady(true);
                });
                setTimeout(() => {
                    if (!cancelled) setReady(true);
                }, 2500);

                if (lat != null && lng != null) {
                    const el = document.createElement('div');
                    el.className = 'rl-route-pin rl-route-pin-pick';
                    el.textContent = '📍';
                    markerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
                        .setLngLat([lng, lat])
                        .addTo(map);
                }

                map.on('click', (e: any) => {
                    onPickRef.current(e.lngLat.lat, e.lngLat.lng);
                });

                setTimeout(() => {
                    if (!cancelled) mapRef.current?.resize();
                }, 60);
            })
            .catch(() => {
                if (!cancelled) setFailed(true);
            });

        return () => {
            cancelled = true;
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
                markerRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Move/create the pin + recenter when the picked coordinate changes
    // (parent state update after a click, or an externally-set lat/lng).
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !ready) return;
        if (lat == null || lng == null) {
            markerRef.current?.remove();
            markerRef.current = null;
            return;
        }
        if (!markerRef.current) {
            const maplibregl = (window as any).maplibregl;
            const el = document.createElement('div');
            el.className = 'rl-route-pin rl-route-pin-pick';
            el.textContent = '📍';
            markerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map);
        } else {
            markerRef.current.setLngLat([lng, lat]);
        }
        map.easeTo({ center: [lng, lat], duration: 300 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lat, lng, ready]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', background: 'var(--bg-2)' }}>
            <div ref={containerRef} style={{ position: 'absolute', inset: 0, zIndex: 1, cursor: 'crosshair' }} />
            {!failed ? (
                <div
                    style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 2,
                        padding: '6px 10px',
                        background: 'rgba(0,0,0,0.6)',
                        fontFamily: 'var(--font-display)',
                        fontSize: 9,
                        letterSpacing: 'var(--track-wider)',
                        color: 'var(--gold)',
                        textAlign: 'center',
                        pointerEvents: 'none',
                    }}
                >
                    {label}
                </div>
            ) : null}
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
