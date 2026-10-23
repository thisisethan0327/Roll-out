'use client';
/**
 * /meets/map in Glide (board G1, Map): the map fills a rounded frame; the
 * title, the List / Map toggle and the type chips float over it, and the
 * upcoming meets ride along the bottom as a card rail. A pin click selects
 * its card (and scrolls the rail to it); hovering or focusing a card lights
 * its pin.
 */
import Link from 'next/link';
import { useRef, useState } from 'react';
import { ChevronRight, Lock, Users } from 'lucide-react';
import { MeetsMap, type MapEvent, type MapShop } from './MeetsMap';
import { Chip, DateRoundel } from '@/components/glide/primitives';
import { FilterChips, ViewToggle, cx } from '@/components/glide-discover/ui';
import { eventDateParts, eventTypeLabel, placeName } from '@/lib/glide-format';

export function MapExplorer({
    events,
    shops,
    title,
    listHref,
    mapHref,
    chips,
}: {
    events: MapEvent[];
    shops: MapShop[];
    title: string;
    listHref: string;
    mapHref: string;
    chips: { href: string; label: string; current: boolean }[];
}) {
    const [activeId, setActiveId] = useState<string | null>(null);
    const railRef = useRef<HTMLUListElement>(null);

    const select = (id: string) => {
        setActiveId(id);
        const card = railRef.current?.querySelector<HTMLElement>(`[data-meet="${CSS.escape(id)}"]`);
        card?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
    };

    const meetsLabel = `${events.length} ${events.length === 1 ? 'meet' : 'meets'}`;
    const shopsLabel = `${shops.length} ${shops.length === 1 ? 'shop' : 'shops'}`;

    return (
        <div className="gd-mapx">
            <MeetsMap
                events={events}
                shops={shops}
                fill
                glide
                activeId={activeId}
                onSelectEvent={select}
                overlayInset={{ top: 170, bottom: events.length > 0 ? 150 : 48 }}
            />

            <div className="gd-mapx-top">
                <div className="gd-mapx-title g-fp">
                    <h1>{title}</h1>
                    <p>
                        <span className="g-w">{events.length}</span> {events.length === 1 ? 'meet' : 'meets'} ·{' '}
                        <span className="g-w">{shops.length}</span> {shops.length === 1 ? 'shop' : 'shops'}
                        <span className="g-sr">
                            {' '}
                            on the map: {meetsLabel} and {shopsLabel}
                        </span>
                    </p>
                </div>
                <ViewToggle current="map" listHref={listHref} mapHref={mapHref} />
            </div>
            <FilterChips items={chips} label="Event type" float className="gd-mapx-chips" />

            {events.length > 0 ? (
                <ul className="gd-rail" ref={railRef} aria-label="Upcoming meets on the map" style={{ listStyle: 'none', margin: 0 }}>
                    {events.map((e) => {
                        const when = eventDateParts(e.start_at, e.time_zone);
                        const hover = {
                            onMouseEnter: () => setActiveId(e.id),
                            onFocus: () => setActiveId(e.id),
                        };
                        return (
                            <li key={e.id} style={{ display: 'contents' }}>
                                <Link href={`/event/${e.id}`} data-meet={e.id} className={cx('gd-meet', activeId === e.id && 'is-active')} {...hover}>
                                    {e.locked ? (
                                        <span className="g-dt" aria-hidden="true" style={{ background: 'var(--surface-2)', color: 'var(--icon)' }}>
                                            <Lock size={20} strokeWidth={1.9} />
                                        </span>
                                    ) : when ? (
                                        <DateRoundel top={when.dow} day={when.day} rings={activeId === e.id} />
                                    ) : null}
                                    <span className="gd-meet-t">
                                        <b>{e.title}</b>
                                        <small>
                                            {e.locked
                                                ? [e.privacy === 'followers' ? 'Followers only' : 'Invite only', e.general_area].filter(Boolean).join(' · ')
                                                : [when ? `${when.dayLabel} · ${when.clock}` : null, placeName(e.location_name) ?? eventTypeLabel(e.type)]
                                                      .filter(Boolean)
                                                      .join(' · ')}
                                        </small>
                                        {!e.locked && e.attending_count > 0 ? (
                                            <span className="g-chips">
                                                <Chip icon={<Users size={14} strokeWidth={2} aria-hidden="true" />}>
                                                    <span className="g-w">{e.attending_count}</span> going
                                                </Chip>
                                            </span>
                                        ) : null}
                                    </span>
                                    <span className="gd-go" aria-hidden="true">
                                        <ChevronRight size={20} strokeWidth={2} />
                                    </span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            ) : null}
        </div>
    );
}
