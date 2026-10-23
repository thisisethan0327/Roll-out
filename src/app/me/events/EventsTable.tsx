'use client';
/**
 * "Your events" table of the host console (board G3, web): All · Upcoming ·
 * Past as the segmented filter, one row per event, the whole row a link to its
 * console page. Filtering is local; the rows come from the server page.
 */
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CalendarPlus, Plus } from 'lucide-react';
import { Segmented } from '@/components/glide/Segmented';
import { GlideButton } from '@/components/glide/primitives';
import { CardHead, Empty } from '@/components/glide-console/parts';
import s from '@/components/glide-console/console.module.css';

export type HostEventRow = {
    id: string;
    title: string;
    sub: string;
    cover: string;
    coverPos: string;
    date: string;
    dateTitle: string;
    status: 'live' | 'past' | 'cancelled';
    statusLabel: string;
    going: number;
    upcoming: boolean;
};

type Filter = 'all' | 'up' | 'past';

export function EventsTable({ rows }: { rows: HostEventRow[] }) {
    const [filter, setFilter] = useState<Filter>('all');
    const upCount = rows.filter((r) => r.upcoming).length;
    const shown = useMemo(
        () => rows.filter((r) => (filter === 'all' ? true : filter === 'up' ? r.upcoming : !r.upcoming)),
        [rows, filter],
    );

    return (
        <>
            <CardHead
                id="ev-h"
                title="Your events"
                action={
                    rows.length > 0 ? (
                        <Segmented<Filter>
                            label="Show events"
                            className={s.seg44}
                            value={filter}
                            onChange={setFilter}
                            options={[
                                { value: 'all', label: 'All' },
                                { value: 'up', label: <>Upcoming <span className="g-w" style={{ fontSize: 10.5 }}>{upCount}</span></> },
                                { value: 'past', label: 'Past' },
                            ]}
                        />
                    ) : null
                }
            />
            {rows.length === 0 ? (
                <Empty
                    icon={<CalendarPlus size={22} strokeWidth={1.75} />}
                    title="You haven’t hosted any events yet"
                    body="Create your first one: a meet, cruise, run or show. It goes on the Meets directory and map, and you can invite people by email."
                    action={
                        <GlideButton href="/me/events/new" size="sm" icon={<Plus size={18} strokeWidth={2} />}>
                            Host an event
                        </GlideButton>
                    }
                />
            ) : shown.length === 0 ? (
                <Empty
                    icon={<CalendarPlus size={22} strokeWidth={1.75} />}
                    title={filter === 'up' ? 'Nothing coming up' : 'No past events'}
                    body={filter === 'up' ? 'Your next event shows up here once you create it.' : 'Events move here after their start time.'}
                />
            ) : (
                <div className={s.tblWrap} style={{ marginTop: 12 }}>
                    <table className={`${s.tbl} ${s.rowLink}`}>
                        <thead>
                            <tr>
                                <th scope="col">Event</th>
                                <th scope="col">Date</th>
                                <th scope="col">Status</th>
                                <th scope="col" style={{ textAlign: 'right' }}>
                                    Going
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {shown.map((r) => (
                                <tr key={r.id}>
                                    <td>
                                        <span className={s.cell}>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                className={s.thumb}
                                                src={r.cover}
                                                alt=""
                                                loading="lazy"
                                                style={{ objectPosition: r.coverPos, filter: r.status === 'cancelled' ? 'grayscale(0.6)' : undefined }}
                                            />
                                            <span style={{ minWidth: 0 }}>
                                                <Link href={`/me/events/${r.id}`} className={s.stretch}>
                                                    <b>{r.title}</b>
                                                </Link>
                                                <small>{r.sub}</small>
                                            </span>
                                        </span>
                                    </td>
                                    <td title={r.dateTitle} style={{ whiteSpace: 'nowrap' }}>
                                        {r.date}
                                    </td>
                                    <td>
                                        <span className={`${s.stc} ${r.status === 'past' ? s.stcPast : r.status === 'cancelled' ? s.stcOff : ''}`}>
                                            <i aria-hidden="true" />
                                            {r.statusLabel}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <span className={s.num}>
                                            {r.going}
                                            <span>going</span>
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
}
