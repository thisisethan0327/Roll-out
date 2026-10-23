'use client';
/**
 * Split view for /meets (≥1024px): the upcoming-meets list on the left, the
 * live map pinned on the right. Both are driven by the same server-loaded,
 * type-filtered data, and they cross-highlight:
 *
 *   - Hovering / focusing a row sets `activeId` → the matching pin becomes the
 *     navy roundel with the tricolore rings.
 *   - Clicking a pin fires `onSelectEvent` → the row scrolls into view and
 *     takes the highlight.
 *
 * The map mounts only at ≥1024px (via matchMedia) so its Leaflet instance never
 * initialises inside a hidden, zero-size container; below that the list is the
 * whole page and the map lives at /meets/map.
 *
 * Glide (web phase 2): rows are components/glide-discover MeetRow; the map is
 * MeetsMap in Glide mode.
 */
import { useEffect, useRef, useState } from 'react';
import { MeetsMap, type MapEvent, type MapShop } from './map/MeetsMap';
import { teaserAreaLabel, teaserShortBadge, type LockedMeet, type TeaserVisibility } from '@/lib/event-teaser-format';
import { LockedMeetRow, MeetRow } from '@/components/glide-discover/ui';

export type SplitMeet = {
    id: string;
    code: string | null;
    type: string | null;
    title: string | null;
    location_name: string | null;
    sector_code: string | null;
    hero_image_url: string | null;
    start_at: string | null;
    time_zone: string | null;
    attending_count: number | null;
    spots_left: number | null;
    is_official: boolean | null;
    host_handle: string | null;
    /** Set on a private / followers-only meet this viewer may open. */
    privacy?: TeaserVisibility | null;
};

function isLocked(m: SplitMeet | LockedMeet): m is LockedMeet {
    return (m as LockedMeet).locked === true;
}

export function MeetsSplit({
    meets,
    events,
    shops,
    updateIds = [],
}: {
    /** Event ids with a live announcement: get an Update pill. */
    updateIds?: string[];
    /** Public meets, merged by date with locked private / followers-only teasers. */
    meets: Array<SplitMeet | LockedMeet>;
    events: MapEvent[];
    shops: MapShop[];
}) {
    const [activeId, setActiveId] = useState<string | null>(null);
    // Gate the Leaflet map to the desktop breakpoint so it never boots inside a
    // hidden 0×0 container. Starts false (matches SSR) → set on mount.
    const [isDesktop, setIsDesktop] = useState(false);
    const listRef = useRef<HTMLUListElement>(null);

    useEffect(() => {
        const mq = window.matchMedia('(min-width: 1024px)');
        const update = () => setIsDesktop(mq.matches);
        update();
        mq.addEventListener('change', update);
        return () => mq.removeEventListener('change', update);
    }, []);

    // Pins with a plottable location — a row only cross-highlights if its event
    // is actually on the map.
    const plottable = new Set(events.map((e) => e.id));

    // Pin click → bring the matching row into view and highlight it.
    const handleSelect = (id: string) => {
        setActiveId(id);
        const row = listRef.current?.querySelector<HTMLElement>(`[data-meet="${CSS.escape(id)}"]`);
        row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    const hover = (id: string) => ({
        'data-meet': id,
        onMouseEnter: () => plottable.has(id) && setActiveId(id),
        onMouseLeave: () => setActiveId((cur) => (cur === id ? null : cur)),
        onFocus: () => plottable.has(id) && setActiveId(id),
        onBlur: () => setActiveId((cur) => (cur === id ? null : cur)),
    });

    return (
        <div className="gd-split">
            <ul className="gd-meets" ref={listRef}>
                {meets.map((m) => (
                    <li key={m.id}>
                        {isLocked(m) ? (
                            <LockedMeetRow
                                m={m}
                                badge={teaserShortBadge(m.visibility)}
                                area={teaserAreaLabel(m.general_area)}
                                active={activeId === m.id}
                                linkProps={hover(m.id)}
                            />
                        ) : (
                            <MeetRow m={m} active={activeId === m.id} hasUpdate={updateIds.includes(m.id)} linkProps={hover(m.id)} />
                        )}
                    </li>
                ))}
            </ul>

            <div className="gd-split-map" aria-label="Map of these meets and shops" role="region">
                {isDesktop ? (
                    <MeetsMap events={events} shops={shops} fill glide activeId={activeId} onSelectEvent={handleSelect} />
                ) : null}
            </div>
        </div>
    );
}
