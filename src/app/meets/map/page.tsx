/**
 * /meets/map — map view of upcoming meets + shops across the platform.
 *
 * Server component: loads the plottable data (public upcoming events with
 * coordinates, and map-visible shops) via the service-role client, then hands
 * it to the client <MapExplorer>: Glide (board G1, Map) — the map fills a
 * rounded frame with date-roundel pins for meets and store roundels for shops,
 * the title, List / Map toggle and type chips float over it, and the meets
 * ride along the bottom as a card rail.
 */
import type { Metadata } from 'next';
import { MapExplorer } from './MapExplorer';
import { loadMapData, isValidType, type EventType } from '../mapData';

// Read at request time: the loader uses the runtime-only service-role key.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    alternates: { canonical: '/meets/map' },
    title: 'Meets Map',
    description:
        'Map of upcoming car meets, night runs, track days, and shops on Rollout — find what is happening near you.',
};

const TYPE_PLURAL: Record<EventType, string> = {
    NIGHT_RUN: 'Night runs',
    CAR_MEET: 'Car meets',
    TRACK_DAY: 'Track days',
    CRUISE: 'Cruises',
    SHOW: 'Shows',
};
const TYPES: EventType[] = ['CAR_MEET', 'CRUISE', 'SHOW', 'TRACK_DAY', 'NIGHT_RUN'];

export default async function MeetsMapPage({
    searchParams,
}: {
    searchParams: Promise<{ type?: string }>;
}) {
    const { type: raw } = await searchParams;
    const type = isValidType(raw) ? raw : null;
    const { events, shops } = await loadMapData(type);
    const listHref = type ? `/meets?type=${type}` : '/meets';
    const mapHref = type ? `/meets/map?type=${type}` : '/meets/map';
    const chips = [
        { href: '/meets/map', label: 'All', current: !type },
        ...TYPES.map((t) => ({ href: `/meets/map?type=${t}`, label: TYPE_PLURAL[t], current: type === t })),
    ];

    return (
        <div className="glide glide-page gd-page">
            <div className="g-wrap">
                <MapExplorer
                    events={events}
                    shops={shops}
                    title={type ? `${TYPE_PLURAL[type]} map` : 'Meets map'}
                    listHref={listHref}
                    mapHref={mapHref}
                    chips={chips}
                />
                {events.length === 0 ? (
                    <p className="gd-legend" style={{ fontSize: 14, color: 'var(--ink-2)' }}>
                        No upcoming {type ? TYPE_PLURAL[type].toLowerCase() : 'meets'} with a pinned location yet. Shops are still on the map.
                    </p>
                ) : null}
            </div>
        </div>
    );
}
