'use client';
/**
 * Client-side Leaflet map for the meets surfaces. Leaflet, MapLibre GL and the
 * plugin that joins them are all loaded from the unpkg CDN at runtime (no npm
 * dep, no SSR window issues); the basemap is OpenFreeMap's dark vector style,
 * which needs no API key. See the loader below for why it is not CARTO.
 *
 * Two marker styles:
 *   - Events  — solid gold dot (the visual priority), gentle glow, grows when
 *               its list card is hovered/selected (`activeId`).
 *   - Shops   — a divIcon with a small gold dot wrapped in animated beacon rings
 *               (CSS keyframes, transform/opacity only, reduced-motion aware).
 *
 * Popups are dark-themed branded cards (Leaflet chrome overridden in globals.css
 * via the `rl-popup` className). Shop popups reuse the /shops directory data —
 * logo, verified chip, rating, capability chips, and shop/store links.
 *
 * The stock zoom box and credit strip are restyled to the house dark/gold
 * register in globals.css (`.leaflet-control-zoom`, `.leaflet-control-
 * attribution`) — the controls themselves are Leaflet's, so keyboard access
 * and ARIA are untouched.
 *
 * Cross-highlighting: the desktop split (/meets) passes `activeId` (card →
 * pin) and `onSelectEvent` (pin click → card). The standalone /meets/map page
 * omits both and behaves as before.
 *
 * Debugging note: this file uses window.L (loaded via CDN). We guard init with
 * a ref so React 18/19 strict-mode double-invoke doesn't create two maps.
 */
import { useEffect, useRef, useState } from 'react';
import { formatEventTime } from '@/lib/event-time';

export type MapEvent = {
    id: string;
    code: string | null;
    type: string | null;
    title: string;
    location_name: string | null;
    start_at: string | null;
    time_zone: string | null;
    lat: number;
    lng: number;
    attending_count: number;
    host_handle: string | null;
    is_official: boolean;
};

export type MapShop = {
    id: number;
    slug: string | null;
    name: string;
    lat: number;
    lng: number;
    city: string | null;
    state_region: string | null;
    location_precision: 'exact' | 'area';
    primary_color: string | null;
    handle: string | null;
    avatar_url: string | null;
    is_verified: boolean;
    rating_avg: number;
    rating_count: number;
    offers_services: boolean;
    sells_products: boolean;
};

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

/**
 * Basemap: OpenFreeMap's dark vector style, drawn through MapLibre GL.
 *
 * This used to be CARTO's dark raster tiles, which are keyless no longer.
 * basemaps.cartocdn.com still answers 200 with a PNG, but every tile now
 * carries an "API KEY REQUIRED" watermark stamped across it — so the map looked
 * broken in production while nothing errored and nothing logged (2026-09-08).
 *
 * OpenFreeMap is keyless by design and permits commercial use, so there is no
 * account to hold, no key in the env and nothing to expire. It serves vector
 * rather than raster, which is the only reason MapLibre is here: the
 * maplibre-gl-leaflet plugin adds it as an ordinary Leaflet layer, so every
 * marker, popup, bounds calculation and click handler below is untouched. The
 * style's own background is rgb(12,12,12), which sits with the house darks.
 */
const MAPLIBRE_CSS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
const MAPLIBRE_JS = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
const MAPLIBRE_LEAFLET_JS =
    'https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.0.22/leaflet-maplibre-gl.js';
/**
 * One style per theme. The map was the last thing on rollout.club still dark in
 * light mode — a black rectangle in the middle of a white page, which reads as
 * a broken image rather than a design choice.
 *
 * Positron is OpenFreeMap's light counterpart to the dark style: same tiles,
 * same keyless terms, same vector pipeline, so nothing below changes but the
 * URL. Its background is near-white and sits with the paper surfaces.
 */
const BASEMAP_STYLES = {
    dark: 'https://tiles.openfreemap.org/styles/dark',
    // Dark in both themes: the light positron tiles fought the black/gold
    // palette on /meets (run 13, slice 2). Both keys resolve to the same style
    // so the theme plumbing below stays inert rather than removed.
    light: 'https://tiles.openfreemap.org/styles/dark',
} as const;

/**
 * The theme actually in force, the same way the CSS decides it: an explicit
 * `data-theme` on the root wins, and `prefers-color-scheme` answers when there
 * is none (globals.css scopes the light block to `:root:not([data-theme])`).
 * Read from the DOM rather than tracked in React state so there is one source
 * of truth and no chance of the map disagreeing with the page around it.
 */
function currentTheme(): 'light' | 'dark' {
    if (typeof document === 'undefined') return 'dark';
    const stamped = document.documentElement.getAttribute('data-theme');
    if (stamped === 'light' || stamped === 'dark') return stamped;
    return typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark';
}
/**
 * The OSM credit is a licence obligation (ODbL) and stays put; only the
 * "Leaflet" prefix is dropped (see `attributionControl: false` + a prefix-less
 * control below). Rendered in the legend line's register by the
 * `.leaflet-control-attribution` rules in globals.css.
 */
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
        const existing = document.querySelector(
            `script[data-${marker}]`,
        ) as HTMLScriptElement | null;
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

/**
 * Leaflet, then MapLibre, then the plugin that marries them. The order is load
 * bearing: the plugin reads both globals when it evaluates, so fetching it
 * alongside either one is a race that fails on a cold cache and works on a warm
 * one — the worst kind.
 */
async function loadLeaflet(): Promise<any> {
    loadCss(LEAFLET_CSS);
    loadCss(MAPLIBRE_CSS);

    if (!(window as any).L) {
        await loadScript(LEAFLET_JS, 'leaflet');
    }
    if (!(window as any).maplibregl) {
        await loadScript(MAPLIBRE_JS, 'maplibre');
    }
    if (!(window as any).L?.maplibreGL) {
        await loadScript(MAPLIBRE_LEAFLET_JS, 'maplibre-leaflet');
    }
    return (window as any).L;
}

function esc(s: string | null | undefined): string {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(iso: string | null, tz?: string | null): string {
    if (!iso) return 'TBA';
    try {
        return (
            formatEventTime(iso, tz)
        );
    } catch {
        return 'TBA';
    }
}

function starStr(rating: number): string {
    const r = Math.max(0, Math.min(5, Math.round(rating)));
    return '★'.repeat(r) + '☆'.repeat(5 - r);
}

function buildEventPopup(e: MapEvent): string {
    const meta = [fmtDate(e.start_at, e.time_zone), e.location_name].filter(Boolean).map(esc).join(' · ');
    return `
        <div class="rl-pop rl-pop-event">
          <div class="rl-pop-kicker">
            <span class="rl-pop-tag rl-pop-tag-gold">${esc(e.code || e.type || 'MEET')}</span>
            ${e.is_official ? '<span class="rl-pop-badge">OFFICIAL</span>' : ''}
          </div>
          <div class="rl-pop-name">${esc(e.title)}</div>
          <div class="rl-pop-meta">${meta}</div>
          <div class="rl-pop-sub"><span class="rl-pop-going">${e.attending_count}</span> going${
              e.host_handle ? ` · @${esc(e.host_handle)}` : ''
          }</div>
          <div class="rl-pop-actions">
            <a class="rl-pop-btn" href="/event/${esc(e.id)}">View event →</a>
          </div>
        </div>`;
}

function buildShopPopup(s: MapShop): string {
    const loc = [s.city, s.state_region].filter(Boolean).join(', ');
    const viewHref = s.handle ? `/u/${esc(s.handle)}` : '/shops';
    const initial = (s.name || '?').trim().charAt(0).toUpperCase();
    const logo = s.avatar_url
        ? `<img src="${esc(s.avatar_url)}" alt="" loading="lazy" />`
        : `<span class="rl-pop-logo-fallback">${esc(initial)}</span>`;

    const kicker = s.is_verified
        ? '<span class="rl-pop-verified">✓ VERIFIED</span>'
        : '<span class="rl-pop-tag">SHOP</span>';
    // Area shops are city-level presence: no street address, an ONLINE ·
    // BASED IN <city> line instead of a plain place.
    const locPart =
        s.location_precision === 'area'
            ? `<span class="rl-pop-sep">·</span>ONLINE${loc ? ` · BASED IN ${esc((s.city || loc).toUpperCase())}` : ''}`
            : loc
              ? `<span class="rl-pop-sep">·</span>${esc(loc)}`
              : '';

    const rating =
        s.rating_count > 0
            ? `<div class="rl-pop-rating"><span class="rl-pop-stars">${starStr(
                  s.rating_avg,
              )}</span> ${s.rating_avg.toFixed(1)} · ${s.rating_count} ${
                  s.rating_count === 1 ? 'REVIEW' : 'REVIEWS'
              }</div>`
            : `<div class="rl-pop-rating rl-pop-rating-empty"><span class="rl-pop-stars">${starStr(
                  0,
              )}</span> NO REVIEWS YET</div>`;

    const chips: string[] = [];
    if (s.offers_services) chips.push('SERVICES');
    if (s.sells_products) chips.push('STORE');
    const chipsHtml = chips.length
        ? `<div class="rl-pop-chips">${chips.map((c) => `<span class="rl-pop-chip">${c}</span>`).join('')}</div>`
        : '';

    const products =
        s.sells_products && s.slug
            ? `<a class="rl-pop-btn rl-pop-btn-ghost" href="/store?shop=${esc(s.slug)}">Products →</a>`
            : '';

    return `
        <div class="rl-pop rl-pop-shop">
          <div class="rl-pop-head">
            <div class="rl-pop-logo">${logo}</div>
            <div class="rl-pop-head-txt">
              <div class="rl-pop-kicker">${kicker}${locPart}</div>
              <div class="rl-pop-name">${esc(s.name)}</div>
            </div>
          </div>
          ${rating}
          ${chipsHtml}
          <div class="rl-pop-actions">
            <a class="rl-pop-btn" href="${viewHref}">View shop →</a>
            ${products}
          </div>
        </div>`;
}

export function MeetsMap({
    events,
    shops,
    fill = false,
    activeId = null,
    onSelectEvent,
}: {
    events: MapEvent[];
    shops: MapShop[];
    /** Fill the parent's height (split view) instead of the default 68vh. */
    fill?: boolean;
    /** Event id whose pin should be highlighted (card → pin cross-highlight). */
    activeId?: string | null;
    /** Fired when an event pin is clicked (pin → card cross-highlight). */
    onSelectEvent?: (id: string) => void;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    /** Detaches the theme listeners; set once the basemap layer exists. */
    const themeCleanupRef = useRef<(() => void) | null>(null);
    const eventMarkersRef = useRef<Map<string, any>>(new Map());
    // Keep the latest callback without re-running the init effect.
    const onSelectRef = useRef(onSelectEvent);
    onSelectRef.current = onSelectEvent;

    // Drives the "LOADING MAP" placeholder: true until the first tile layer
    // reports it has painted (or we fail). Leaflet, MapLibre and the basemap all
    // load from a CDN and can take 1–3s, during which the canvas is blank.
    const [tilesReady, setTilesReady] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;

        loadLeaflet()
            .then((L) => {
                if (cancelled || !containerRef.current) return;
                // Guard against double-init (strict mode / re-render).
                if (mapRef.current || (containerRef.current as any)._leaflet_id) return;

                const map = L.map(containerRef.current, {
                    zoomControl: true,
                    scrollWheelZoom: false,
                    // Suppress the default control so we can re-add one with
                    // `prefix: false` — that prefix is the only way to drop the
                    // "Leaflet | " lead-in from the credit strip.
                    attributionControl: false,
                });
                mapRef.current = map;
                // Order matters: Leaflet registers a layer's attribution into
                // whatever control is on the map at addLayer() time, so this has
                // to exist before the tile layer below is added.
                L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(map);

                const tiles = L.maplibreGL({
                    style: BASEMAP_STYLES[currentTheme()],
                    attribution: BASEMAP_ATTRIBUTION,
                });
                tiles.addTo(map);

                // Follow the theme while the page is open: the OS preference can
                // change under us, and the shop toggle stamps data-theme without
                // a reload. Markers are Leaflet objects and survive a style swap
                // untouched — only the basemap is replaced.
                const applyTheme = () => {
                    try {
                        tiles.getMaplibreMap()?.setStyle(BASEMAP_STYLES[currentTheme()]);
                    } catch {
                        // A style swap is cosmetic; never let it break the map.
                    }
                };
                const mq = window.matchMedia?.('(prefers-color-scheme: light)');
                mq?.addEventListener?.('change', applyTheme);
                const themeObserver = new MutationObserver(applyTheme);
                themeObserver.observe(document.documentElement, {
                    attributes: true,
                    attributeFilter: ['data-theme'],
                });
                themeCleanupRef.current = () => {
                    mq?.removeEventListener?.('change', applyTheme);
                    themeObserver.disconnect();
                };
                // A GL layer has no Leaflet 'load' event; the readiness signal
                // is the underlying MapLibre map's own 'load'. Wrapped because
                // getMaplibreMap() is only available once the layer is added,
                // and the timer below is the backstop either way.
                try {
                    tiles.getMaplibreMap()?.on('load', () => {
                        if (!cancelled) setTilesReady(true);
                    });
                } catch {
                    // Fall through to the timeout — a placeholder that clears
                    // late is a great deal better than one that never clears.
                }
                // Fallback: never leave the placeholder up forever if 'load'
                // doesn't fire (all tiles cached, sparse viewport, etc.).
                setTimeout(() => {
                    if (!cancelled) setTilesReady(true);
                }, 2500);
                // Sticky/flex containers can measure 0 on first paint; correct it.
                setTimeout(() => {
                    if (!cancelled && mapRef.current) mapRef.current.invalidateSize();
                }, 60);

                const bounds: [number, number][] = [];

                // Event markers — solid gold dot (priority), highlightable.
                const eventIcon = L.divIcon({
                    className: '',
                    html: '<div class="rl-pin rl-pin-event"><span class="rl-pin-dot"></span></div>',
                    iconSize: [22, 22],
                    iconAnchor: [11, 11],
                    popupAnchor: [0, -12],
                });
                eventMarkersRef.current.clear();
                for (const e of events) {
                    const marker = L.marker([e.lat, e.lng], { icon: eventIcon, riseOnHover: true }).addTo(map);
                    marker.bindPopup(buildEventPopup(e), { className: 'rl-popup', maxWidth: 300, minWidth: 210 });
                    marker.on('click', () => onSelectRef.current?.(e.id));
                    eventMarkersRef.current.set(e.id, marker);
                    bounds.push([e.lat, e.lng]);
                }

                // Shop markers — two styles:
                //   exact → solid gold dot inside animated beacon rings.
                //   area  → softer, hollow "area" pin (city-level presence), so
                //           a city-centroid pin reads differently from a precise
                //           street pin.
                const shopIcon = L.divIcon({
                    className: '',
                    html:
                        '<div class="rl-pin rl-pin-shop">' +
                        '<span class="rl-beacon-ring"></span>' +
                        '<span class="rl-beacon-ring rl-beacon-ring-2"></span>' +
                        '<span class="rl-pin-dot"></span>' +
                        '</div>',
                    iconSize: [16, 16],
                    iconAnchor: [8, 8],
                    popupAnchor: [0, -9],
                });
                const shopAreaIcon = L.divIcon({
                    className: '',
                    html:
                        '<div class="rl-pin rl-pin-shop rl-pin-shop-area">' +
                        '<span class="rl-area-halo"></span>' +
                        '<span class="rl-pin-dot"></span>' +
                        '</div>',
                    iconSize: [22, 22],
                    iconAnchor: [11, 11],
                    popupAnchor: [0, -11],
                });
                for (const s of shops) {
                    const icon = s.location_precision === 'area' ? shopAreaIcon : shopIcon;
                    const marker = L.marker([s.lat, s.lng], { icon }).addTo(map);
                    marker.bindPopup(buildShopPopup(s), { className: 'rl-popup', maxWidth: 300, minWidth: 220 });
                    bounds.push([s.lat, s.lng]);
                }

                if (bounds.length === 1) {
                    map.setView(bounds[0], 13);
                } else if (bounds.length > 1) {
                    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14 });
                } else {
                    // No pins at all: the national view, then the visitor's own area
                    // if the browser will say. Never a city the visitor may not be in.
                    map.setView([39.5, -98.35], 4);
                    // Geolocation only on a gesture (the USE MY LOCATION control below) —
                    // a prompt on load with no gesture is a nag, not a feature.
                }

                // Re-enable wheel zoom only after a click so the page still scrolls.
                map.on('click', () => map.scrollWheelZoom.enable());
                map.on('mouseout', () => map.scrollWheelZoom.disable());
            })
            .catch(() => {
                /* CDN blocked — surface a fallback notice instead of a spinner. */
                if (!cancelled) setFailed(true);
            });

        return () => {
            cancelled = true;
            eventMarkersRef.current.clear();
            themeCleanupRef.current?.();
            themeCleanupRef.current = null;
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, [events, shops]);

    // Cross-highlight: reflect the active event id onto its pin.
    useEffect(() => {
        const markers = eventMarkersRef.current;
        markers.forEach((marker, id) => {
            const el = marker.getElement?.();
            const pin = el?.querySelector?.('.rl-pin');
            const on = id === activeId;
            if (pin) pin.classList.toggle('rl-pin-active', on);
            marker.setZIndexOffset?.(on ? 1000 : 0);
        });
    }, [activeId]);

    return (
        <div
            style={{
                position: 'relative',
                width: '100%',
                height: fill ? '100%' : '68vh',
                minHeight: fill ? 0 : 420,
                background: 'var(--bg-2)',
            }}
        >
            <div ref={containerRef} style={{ position: 'absolute', inset: 0, zIndex: 1 }} />
            {/* Animated placeholder while Leaflet + tiles load; Leaflet paints
                over it on success (zIndex:1 > 0). Cleared once tiles report load. */}
            {!tilesReady && !failed && (
                <div className="rl-map-loading">
                    <div className="rl-map-inner">
                        <div className="rl-map-grid" />
                        <span className="rl-skel-eyebrow">
                            LOADING MAP
                            <span className="rl-dots" aria-hidden="true"><i /><i /><i /></span>
                        </span>
                    </div>
                </div>
            )}
            {failed && (
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--text-2)', zIndex: 2, textAlign: 'center', padding: 24 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: 'var(--track-wider)' }}>
                        MAP UNAVAILABLE · CHECK CONNECTION
                    </div>
                </div>
            )}
            {events.length === 0 && shops.length === 0 && !failed ? (
                <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ position: 'absolute', left: 12, bottom: 12, zIndex: 3, fontSize: 11, padding: '10px 14px' }}
                    onClick={() => mapRef.current?.locate({ setView: true, maxZoom: 10 })}
                >
                    USE MY LOCATION
                </button>
            ) : null}
            {/* Fallback shown until Leaflet paints over it (or if the CDN is blocked). */}
            <noscript>
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--text-2)' }}>
                    Enable JavaScript to view the map.
                </div>
            </noscript>
        </div>
    );
}
