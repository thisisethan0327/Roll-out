/**
 * /meets/map — map view of upcoming meets + shops across the platform.
 *
 * Server component: loads the plottable data (public upcoming events with
 * coordinates, and map-visible shops) via the service-role client, then hands
 * it to the client <MeetsMap> which renders Leaflet + CARTO dark tiles (no API
 * key). Two pin styles: events (gold) and shops (outline), each with a popover
 * that deep-links to the event / shop profile.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { MeetsMap } from './MeetsMap';
import { loadMapData, isValidType, type EventType } from '../mapData';

const TYPE_LABEL: Record<EventType, string> = {
    NIGHT_RUN: 'Night Run',
    CAR_MEET: 'Car Meet',
    TRACK_DAY: 'Track Day',
    CRUISE: 'Cruise',
    SHOW: 'Show',
};

// Read at request time: the loader uses the runtime-only service-role key.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Meets Map · Rollout',
    description:
        'Map of upcoming car meets, night runs, track days, and shops on Rollout — find what is happening near you.',
};

export default async function MeetsMapPage({
    searchParams,
}: {
    searchParams: Promise<{ type?: string }>;
}) {
    const { type: raw } = await searchParams;
    const type = isValidType(raw) ? raw : null;
    const { events, shops } = await loadMapData(type);
    const listHref = type ? `/meets?type=${type}` : '/meets';

    return (
        <>
            {/* HEADER + VIEW TOGGLE */}
            <section style={{ background: 'var(--bg-1)', borderBottom: '1px solid var(--line)' }}>
                <div
                    className="container"
                    style={{ padding: '18px 0', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}
                >
                    <div>
                        <div className="eyebrow eyebrow-gold mb-4">／ MEETS MAP</div>
                        <h1 style={{ fontSize: 'clamp(22px, 3vw, 34px)', letterSpacing: 1, margin: 0 }}>
                            {type ? `${TYPE_LABEL[type].toUpperCase()} · MAP` : "WHAT'S NEARBY"}
                        </h1>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <Link
                            href={listHref}
                            style={{
                                padding: '8px 14px',
                                border: '1px solid var(--gold)',
                                background: 'transparent',
                                color: 'var(--gold)',
                                fontFamily: 'var(--font-display)',
                                fontSize: 11,
                                letterSpacing: 'var(--track-wider)',
                                textDecoration: 'none',
                            }}
                        >
                            ◂ LIST
                        </Link>
                        <span
                            style={{
                                padding: '8px 14px',
                                border: '1px solid var(--gold)',
                                background: 'var(--gold)',
                                color: 'var(--bg-0, #000)',
                                fontFamily: 'var(--font-display)',
                                fontSize: 11,
                                letterSpacing: 'var(--track-wider)',
                            }}
                        >
                            MAP
                        </span>
                    </div>
                </div>
            </section>

            <MeetsMap events={events} shops={shops} />

            {/* LEGEND / COUNTS */}
            <section style={{ background: 'var(--bg-1)', borderTop: '1px solid var(--line)' }}>
                <div
                    className="container"
                    style={{ padding: '14px 0', display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}
                >
                    <span className="mono-row" style={{ fontSize: 11 }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: 'var(--gold)', marginRight: 6 }} />
                        {events.length} UPCOMING {events.length === 1 ? 'MEET' : 'MEETS'}
                    </span>
                    <span className="mono-row" style={{ fontSize: 11 }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, border: '2px solid var(--text)', marginRight: 6 }} />
                        {shops.length} {shops.length === 1 ? 'SHOP' : 'SHOPS'}
                    </span>
                    {events.length === 0 ? (
                        <span className="text-dim" style={{ fontSize: 12 }}>
                            No upcoming meets with a pinned location{type ? ' in this category' : ''} yet — shops still shown.
                        </span>
                    ) : null}
                </div>
            </section>
        </>
    );
}
