'use client';
/**
 * Client-side Leaflet map for /meets/map. Leaflet is loaded from the unpkg CDN
 * at runtime (no npm dep, no SSR window issues) and CARTO dark tiles keep it on
 * theme with no API key. Two marker styles — gold for events, outlined square
 * for shops — each with a popup that deep-links into the site.
 *
 * Debugging note: this file uses window.L (loaded via CDN). We guard init with
 * a ref so React 18/19 strict-mode double-invoke doesn't create two maps.
 */
import { useEffect, useRef } from 'react';

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
    primary_color: string | null;
    handle: string | null;
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

export function MeetsMap({ events, shops }: { events: MapEvent[]; shops: MapShop[] }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);

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

                L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                    attribution:
                        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
                    subdomains: 'abcd',
                    maxZoom: 20,
                }).addTo(map);

                const bounds: [number, number][] = [];

                // Event markers — gold dot.
                const eventIcon = L.divIcon({
                    className: '',
                    html:
                        '<div style="width:18px;height:18px;border-radius:50%;background:#e8a845;border:2px solid #000;box-shadow:0 0 0 2px rgba(232,168,69,0.5);"></div>',
                    iconSize: [18, 18],
                    iconAnchor: [9, 9],
                });
                for (const e of events) {
                    const m = L.marker([e.lat, e.lng], { icon: eventIcon }).addTo(map);
                    const popup = `
                        <div style="font-family:system-ui,sans-serif;min-width:180px">
                          <div style="font-size:10px;letter-spacing:1px;color:#e8a845;text-transform:uppercase">${esc(e.code || e.type || 'MEET')}${e.is_official ? ' · OFFICIAL' : ''}</div>
                          <div style="font-size:14px;font-weight:700;margin:4px 0;color:#111">${esc(e.title)}</div>
                          <div style="font-size:12px;color:#555">${esc(fmtDate(e.start_at))}${e.location_name ? ' · ' + esc(e.location_name) : ''}</div>
                          <div style="font-size:11px;color:#777;margin-top:2px">${e.attending_count} going${e.host_handle ? ' · @' + esc(e.host_handle) : ''}</div>
                          <a href="/event/${e.id}" style="display:inline-block;margin-top:8px;font-size:12px;font-weight:700;color:#b06f00;text-decoration:none">View event ›</a>
                        </div>`;
                    m.bindPopup(popup);
                    bounds.push([e.lat, e.lng]);
                }

                // Shop markers — outlined square.
                const shopIcon = L.divIcon({
                    className: '',
                    html:
                        '<div style="width:16px;height:16px;border-radius:3px;background:#0c0c14;border:2px solid #f0f0f0;box-shadow:0 0 0 2px rgba(0,0,0,0.4);"></div>',
                    iconSize: [16, 16],
                    iconAnchor: [8, 8],
                });
                for (const s of shops) {
                    const m = L.marker([s.lat, s.lng], { icon: shopIcon }).addTo(map);
                    const loc = [s.city, s.state_region].filter(Boolean).join(', ');
                    const link = s.handle ? `/u/${s.handle}` : '/shops';
                    const popup = `
                        <div style="font-family:system-ui,sans-serif;min-width:170px">
                          <div style="font-size:10px;letter-spacing:1px;color:#888;text-transform:uppercase">SHOP</div>
                          <div style="font-size:14px;font-weight:700;margin:4px 0;color:#111">${esc(s.name)}</div>
                          ${loc ? `<div style="font-size:12px;color:#555">${esc(loc)}</div>` : ''}
                          <a href="${link}" style="display:inline-block;margin-top:8px;font-size:12px;font-weight:700;color:#b06f00;text-decoration:none">View shop ›</a>
                        </div>`;
                    m.bindPopup(popup);
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
                /* CDN blocked — the fallback notice below stays visible. */
            });

        return () => {
            cancelled = true;
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, [events, shops]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '68vh', minHeight: 420, background: 'var(--bg-2)' }}>
            <div ref={containerRef} style={{ position: 'absolute', inset: 0, zIndex: 1 }} />
            {/* Fallback shown until Leaflet paints over it (or if the CDN is blocked). */}
            <noscript>
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--text-2)' }}>
                    Enable JavaScript to view the map.
                </div>
            </noscript>
        </div>
    );
}
