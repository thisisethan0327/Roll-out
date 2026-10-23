'use client';
/**
 * The web shop page's isometric diorama (board G5, web): day art in Light,
 * night art in Midnight and Graphite, 44px hotspots that pulse, and the
 * floating shop card whose lower pane follows the selected hotspot. A second
 * tap on the selected hotspot, or its pane's close button, returns to the
 * shop's details. Hotspots without content on this shop are not drawn.
 *
 * Reduced motion: no pulse, no pane animation (discover.css).
 */
import { useState, type ReactNode } from 'react';
import { CircleDot, X } from 'lucide-react';
import type { Diorama, DioHotspot } from './dioramas';

export type DioPane = { title: string; sub?: string; icon: ReactNode; body: ReactNode };

export function ShopDiorama({
    dio,
    header,
    details,
    panes,
    labelledBy,
}: {
    dio: Diorama;
    /** Name, place and chips: always shown at the top of the card. */
    header: ReactNode;
    /** The default pane: address and hours rows. */
    details: ReactNode;
    /** Pane per hotspot key; a key without a pane hides its hotspot. */
    panes: Partial<Record<DioHotspot['key'], DioPane>>;
    labelledBy: string;
}) {
    const [sel, setSel] = useState<DioHotspot['key'] | null>(null);
    const spots = dio.hotspots.filter((h) => panes[h.key]);
    const pane = sel ? panes[sel] : null;

    const art = (mode: 'day' | 'night') => (
        <div className={`gd-dio-in ${mode === 'day' ? 'g-only-light' : 'g-only-dark'}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mode === 'day' ? dio.day : dio.night} alt={mode === 'day' ? dio.altDay : dio.altNight} fetchPriority={mode === 'day' ? 'high' : undefined} />
            {spots.map((h) => {
                const [x, y] = mode === 'night' && h.night ? h.night : h.day;
                const on = sel === h.key;
                return (
                    <button
                        key={h.key}
                        type="button"
                        className="gd-hs"
                        style={{ left: `${x}%`, top: `${y}%` }}
                        aria-pressed={on}
                        aria-label={h.aria}
                        aria-controls="gd-dio-pane"
                        onClick={() => setSel(on ? null : h.key)}
                    >
                        <span className="gd-hs-dot" />
                        <span className="gd-hs-lab g-fp" aria-hidden="true">
                            {h.label}
                        </span>
                    </button>
                );
            })}
        </div>
    );

    return (
        <section className="gd-dio gd-hero--dio g-edge" aria-labelledby={labelledBy}>
            {art('day')}
            {art('night')}
            <div className="gd-sp-card g-fp">
                <div className="gd-sp-hd">{header}</div>
                <div id="gd-dio-pane" aria-live="polite">
                    {pane ? (
                        <div className="gd-pane" key={sel}>
                            <div className="gd-pane-h">
                                <span className="g-ic g-ic--sm" aria-hidden="true">
                                    {pane.icon}
                                </span>
                                <div className="t">
                                    <h2>{pane.title}</h2>
                                    {pane.sub ? <p>{pane.sub}</p> : null}
                                </div>
                                <button type="button" className="g-cb g-cb--fill" aria-label="Back to the shop details" onClick={() => setSel(null)}>
                                    <X size={18} strokeWidth={2} aria-hidden="true" />
                                </button>
                            </div>
                            <div className="gd-pane-body">{pane.body}</div>
                        </div>
                    ) : (
                        details
                    )}
                </div>
            </div>
            {spots.length > 0 ? (
                <div className="gd-hint g-fp" aria-hidden="true">
                    <CircleDot size={16} strokeWidth={2} />
                    Tap the shop
                </div>
            ) : null}
        </section>
    );
}
