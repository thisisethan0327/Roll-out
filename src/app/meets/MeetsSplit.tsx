'use client';
/**
 * Desktop split view for /meets (≥1024px): the upcoming-meets list on the left,
 * the live map pinned on the right. Both are driven by the same server-loaded,
 * type-filtered data, and they cross-highlight:
 *
 *   - Hovering / focusing a card sets `activeId` → the matching pin grows.
 *   - Clicking a pin fires `onSelectEvent` → the card scrolls into view and
 *     flashes its highlight.
 *
 * Mounted only at ≥1024px (via matchMedia) so the map's Leaflet instance never
 * initialises inside a hidden, zero-size container on mobile — where the classic
 * list + LIST/MAP toggle is used instead. The parent also hides this block below
 * 1024px in CSS as a belt-and-braces guard.
 */
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { resolveCover } from '@/lib/event-covers';
import { MeetsMap, type MapEvent, type MapShop } from './map/MeetsMap';

export type SplitMeet = {
    id: string;
    code: string | null;
    type: string | null;
    title: string | null;
    location_name: string | null;
    sector_code: string | null;
    hero_image_url: string | null;
    start_at: string | null;
    attending_count: number | null;
    spots_left: number | null;
    is_official: boolean | null;
    host_handle: string | null;
};

function formatDate(iso: string | null): string {
    if (!iso) return 'TBA';
    try {
        return (
            new Date(iso).toLocaleString('en-US', {
                weekday: 'short',
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

export function MeetsSplit({
    meets,
    events,
    shops,
}: {
    meets: SplitMeet[];
    events: MapEvent[];
    shops: MapShop[];
}) {
    const [activeId, setActiveId] = useState<string | null>(null);
    // Gate the Leaflet map to the desktop breakpoint so it never boots inside a
    // hidden 0×0 container. Starts false (matches SSR) → set on mount.
    const [isDesktop, setIsDesktop] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const mq = window.matchMedia('(min-width: 1024px)');
        const update = () => setIsDesktop(mq.matches);
        update();
        mq.addEventListener('change', update);
        return () => mq.removeEventListener('change', update);
    }, []);

    // Pins with a plottable location — a card only cross-highlights if its event
    // is actually on the map.
    const plottable = new Set(events.map((e) => e.id));

    // Pin click → bring the matching card into view + flash it. The map is
    // sticky and the page scrolls, so a window-level scroll is what we want here.
    const handleSelect = (id: string) => {
        setActiveId(id);
        const card = listRef.current?.querySelector<HTMLElement>(`[data-meet="${CSS.escape(id)}"]`);
        card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    return (
        <div className="meets-split">
            <div className="meets-split-list" ref={listRef}>
                {meets.map((m) => (
                    <Link
                        key={m.id}
                        href={`/event/${m.id}`}
                        data-meet={m.id}
                        className={`meets-split-card${activeId === m.id ? ' is-active' : ''}`}
                        onMouseEnter={() => plottable.has(m.id) && setActiveId(m.id)}
                        onMouseLeave={() => setActiveId((cur) => (cur === m.id ? null : cur))}
                        onFocus={() => plottable.has(m.id) && setActiveId(m.id)}
                        onBlur={() => setActiveId((cur) => (cur === m.id ? null : cur))}
                    >
                        <div
                            className="meets-split-thumb"
                            style={{ backgroundImage: `url(${resolveCover(m.hero_image_url, m.type, m.id)})` }}
                        />
                        <div className="meets-split-body">
                            <div className="mono-row" style={{ fontSize: 10 }}>
                                <span className="accent">{m.code ?? m.type ?? 'MEET'}</span>
                                {m.is_official ? (
                                    <>
                                        <span className="sep" />
                                        <span className="accent">OFFICIAL</span>
                                    </>
                                ) : null}
                                {m.sector_code ? (
                                    <>
                                        <span className="sep" />
                                        <span>{m.sector_code}</span>
                                    </>
                                ) : null}
                                {plottable.has(m.id) ? (
                                    <>
                                        <span className="sep" />
                                        <span className="meets-split-pin" aria-label="On the map">◉ MAP</span>
                                    </>
                                ) : null}
                            </div>
                            <h3 className="meets-split-title">{(m.title ?? 'Untitled meet').toUpperCase()}</h3>
                            <div className="text-dim" style={{ fontSize: 12.5 }}>
                                {formatDate(m.start_at)} · {m.location_name ?? 'TBA'}
                            </div>
                            <div className="mono-row" style={{ fontSize: 10, marginTop: 'auto', paddingTop: 8 }}>
                                <span><span className="accent">●</span> {m.attending_count ?? 0} GOING</span>
                                {m.spots_left != null ? (
                                    <>
                                        <span className="sep" />
                                        <span>{m.spots_left} SPOTS</span>
                                    </>
                                ) : null}
                                {m.host_handle ? (
                                    <>
                                        <span className="sep" />
                                        <span>@{m.host_handle}</span>
                                    </>
                                ) : null}
                            </div>
                        </div>
                    </Link>
                ))}
            </div>

            <div className="meets-split-map">
                {isDesktop ? (
                    <MeetsMap events={events} shops={shops} fill activeId={activeId} onSelectEvent={handleSelect} />
                ) : null}
            </div>
        </div>
    );
}
