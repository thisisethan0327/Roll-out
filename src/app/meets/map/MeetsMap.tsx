'use client';
/**
 * Client-side Leaflet map for the meets surfaces. Leaflet is loaded from the
 * unpkg CDN at runtime (no npm dep, no SSR window issues) and CARTO dark tiles
 * keep it on theme with no API key.
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
 * Cross-highlighting: the desktop split (/meets) passes `activeId` (card →
 * pin) and `onSelectEvent` (pin click → card). The standalone /meets/map page
 * omits both and behaves as before.
 *
 * Debugging note: this file uses window.L (loaded via CDN). We guard init with
 * a ref so React 18/19 strict-mode double-invoke doesn't create two maps.
 */
import { useEffect, useRef, useState } from 'react';

export type MapEvent = {
    id: string;
    code: string | null;
    type: string | null;
    title: string;
    location_name: string | null;
    start_at: string | null;
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

function loadLeaflet(): Promise<any> {
    return new Promise((resolve, reject) => {
        const w = window as any;
        if (w.L) return resolve(w.L);

        // CSS (once)
        if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = LEAFLET_CSS;
            document.head.appendChild(link);
        }

        // JS (once) — reuse an in-flight load if present.
        const existing = document.querySelector(`script[data-leaflet]`) as HTMLScriptElement | null;
        if (existing) {
            existing.addEventListener('load', () => resolve((window as any).L));
            existing.addEventListener('error', reject);
            return;
        }
        const script = document.createElement('script');
        script.src = LEAFLET_JS;
        script.async = true;
        script.setAttribute('data-leaflet', '1');
        script.addEventListener('load', () => resolve((window as any).L));
        script.addEventListener('error', reject);
        document.body.appendChild(script);
    });
}

function esc(s: string | null | undefined): string {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(iso: string | null): string {
    if (!iso) return 'TBA';
    try {
        return (
            new Date(iso).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                timeZone: 'America/Los_Angeles',
            }) + ' PT'
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
    const meta = [fmtDate(e.start_at), e.location_name].filter(Boolean).map(esc).join(' · ');
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
    const eventMarkersRef = useRef<Map<string, any>>(new Map());
    // Keep the latest callback without re-running the init effect.
    const onSelectRef = useRef(onSelectEvent);
    onSelectRef.current = onSelectEvent;

    // Drives the "LOADING MAP" placeholder: true until the first tile layer
    // reports it has painted (or we fail). Leaflet + CARTO tiles load from a
    // CDN and can take 1–3s, during which the canvas is otherwise blank.
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
                });
                mapRef.current = map;

                const tiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                    attribution:
                        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
                    subdomains: 'abcd',
                    maxZoom: 20,
                });
                // Clear the placeholder once tiles have painted (or errored).
                tiles.on('load', () => {
                    if (!cancelled) setTilesReady(true);
                });
                tiles.addTo(map);
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
                    // No pins at all — default to Seattle (platform home).
                    map.setView([47.5783, -122.334], 11);
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
            {/* Fallback shown until Leaflet paints over it (or if the CDN is blocked). */}
            <noscript>
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--text-2)' }}>
                    Enable JavaScript to view the map.
                </div>
            </noscript>
        </div>
    );
}
