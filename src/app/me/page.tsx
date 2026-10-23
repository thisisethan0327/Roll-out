/**
 * /me — member overview. Profile card, quick links, upcoming RSVPs, and recent
 * activity (latest tickets + appointments) pulled from the identity-scoped
 * loaders.
 *
 * Glide (board: G4 "You"): the member card with the tricolore avatar ring,
 * the sections as plain rows, and the lists in cards. Same loaders, same links.
 */
import { CalendarClock, CalendarDays, Car, ChevronRight, Clock, Info, Package, Pencil, UserRound, Wrench } from 'lucide-react';
import { formatEventTime } from '@/lib/event-time';
import { requireConsumer } from '@/lib/me-guard';
import { loadMyTickets, loadMyAppointments, loadMyUpcomingRsvps } from '@/lib/me-data';
import { resolveCover } from '@/lib/event-covers';
import { eventDateParts } from '@/lib/glide-format';
import { fmtDate } from './ui';
import { HostPanel } from './HostPanel';
import { Card, Row, SecButton } from '@/components/glide/primitives';
import { CardHead, Empty, StatusChip } from '@/components/glide-console/parts';
import s from '@/components/glide-console/console.module.css';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const ic = { size: 22, strokeWidth: 1.75, 'aria-hidden': true } as const;
const chev = <ChevronRight className="g-row-ch" size={18} strokeWidth={2} aria-hidden="true" />;

export default async function MeOverview({ searchParams }: { searchParams: Promise<{ note?: string; host?: string }> }) {
    const profile = await requireConsumer('/me');
    // ?note=address — onboarding saved the profile but the store could not take
    // the shipping address (best-effort by design): say so once, here.
    const { note, host } = await searchParams;
    const [tickets, appts, rsvps] = await Promise.all([
        loadMyTickets(),
        loadMyAppointments(profile.profileId),
        loadMyUpcomingRsvps(profile.profileId),
    ]);

    const recentTickets = tickets.slice(0, 4);
    const recentAppts = appts.slice(0, 4);
    const name = profile.displayName || 'Member';
    const initial = (profile.displayName?.[0] ?? '?').toUpperCase();

    return (
        <div className={s.scope}>
            {host === 'not_verified' || host === 'pending' || note === 'address' ? (
                <div className={s.notes}>
                    {host === 'not_verified' ? (
                        <p className={`g-note ${s.note}`} role="status">
                            <Info size={20} strokeWidth={2} aria-hidden="true" />
                            Hosting a meet needs a verified host account. Ask for host access below — a Rollout admin reviews it, then My events opens up.
                        </p>
                    ) : host === 'pending' ? (
                        <p className={`g-note ${s.note}`} role="status">
                            <Clock size={20} strokeWidth={2} aria-hidden="true" />
                            Your host request is being reviewed. You&apos;ll be able to create meets once it&apos;s approved.
                        </p>
                    ) : null}
                    {note === 'address' ? (
                        <p className={`g-note ${s.note}`} role="status">
                            <Info size={20} strokeWidth={2} aria-hidden="true" />
                            We couldn&apos;t save your shipping address just now — you can add it at checkout.
                        </p>
                    ) : null}
                </div>
            ) : null}

            <div className={s.side}>
                <div className={s.col}>
                    {/* THE MEMBER */}
                    <Card as="section" edge className={s.pCard} aria-label="Your profile">
                        <div className={s.pTop}>
                            <span
                                className={s.pAv}
                                style={profile.avatarUrl ? { backgroundImage: `url(${profile.avatarUrl})` } : undefined}
                                aria-hidden="true"
                            >
                                {profile.avatarUrl ? null : initial}
                            </span>
                            <div style={{ minWidth: 0 }}>
                                <h1 className={s.pName}>{name}</h1>
                                <p className={s.pHandle}>@{profile.handle}</p>
                                {profile.email ? <p className={s.pHandle} style={{ marginTop: 2, fontSize: 13.5 }}>{profile.email}</p> : null}
                            </div>
                        </div>
                        <div className={s.pActs}>
                            <SecButton href="/me/settings">
                                <Pencil size={17} strokeWidth={2} aria-hidden="true" />
                                Edit profile
                            </SecButton>
                            <SecButton href={`/u/${profile.handle}`}>
                                <UserRound size={17} strokeWidth={2} aria-hidden="true" />
                                Public profile
                            </SecButton>
                        </div>
                    </Card>

                    {/* SECTIONS */}
                    <Card as="section" aria-label="Your Rollout">
                        <ul className={`g-rows ${s.rowsFlush}`} style={{ padding: '6px 0' }}>
                            <Row href="/me/appointments" icon={<CalendarClock {...ic} />} label="Appointments" sub="Booking requests to shops" value={<span className={s.rowValue}>{appts.length}</span>} trailing={chev} />
                            <Row href="/me/tickets" icon={<Wrench {...ic} />} label="Tickets" sub="Work at your shops" value={<span className={s.rowValue}>{tickets.length}</span>} trailing={chev} />
                            <Row href="/me/orders" icon={<Package {...ic} />} label="Orders" sub="Store purchases" trailing={chev} />
                            <Row href="/me/garage" icon={<Car {...ic} />} label="Garage" sub="Your cars and posts" trailing={chev} />
                        </ul>
                    </Card>

                    {/* BECOME A HOST */}
                    <HostPanel hostStatus={profile.hostStatus} nominated={profile.hostAppointedByShopId != null} />
                </div>

                <div className={s.col}>
                    {/* UPCOMING RSVPS */}
                    <Card as="section" aria-labelledby="up-h">
                        <CardHead
                            id="up-h"
                            title="Upcoming meets"
                            action={
                                <Link href="/meets" className="g-link">
                                    All meets
                                    <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
                                </Link>
                            }
                        />
                        {rsvps.length === 0 ? (
                            <Empty
                                icon={<CalendarDays size={22} strokeWidth={1.75} />}
                                title="Nothing on your calendar"
                                body="Meets you RSVP to show up here, soonest first."
                                action={<SecButton href="/meets">Find a meet</SecButton>}
                            />
                        ) : (
                            <ul className={`g-rows ${s.cardRows}`}>
                                {rsvps.map((r) => {
                                    const d = eventDateParts(r.start_at, r.time_zone);
                                    return (
                                        <Row
                                            key={r.event_id}
                                            href={`/event/${r.event_id}`}
                                            icon={
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img className={s.thumb} src={resolveCover(r.hero_image_url, r.type, r.event_id)} alt="" loading="lazy" />
                                            }
                                            label={r.title ?? 'Meet'}
                                            sub={r.location_name ?? 'Location TBA'}
                                            trailing={
                                                <span className={s.rowEnd}>
                                                    <span className={s.rowValue} title={formatEventTime(r.start_at, r.time_zone)}>
                                                        {d ? `${d.dayLabel} · ${d.clock}` : 'TBA'}
                                                    </span>
                                                    {r.status ? <StatusChip status={r.status} /> : null}
                                                </span>
                                            }
                                        />
                                    );
                                })}
                            </ul>
                        )}
                    </Card>

                    {/* RECENT ACTIVITY */}
                    <div className={s.g2}>
                        <Card as="section" aria-labelledby="rt-h">
                            <CardHead
                                id="rt-h"
                                title="Recent tickets"
                                action={
                                    <Link href="/me/tickets" className="g-link">
                                        All
                                        <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
                                    </Link>
                                }
                            />
                            {recentTickets.length === 0 ? (
                                <Empty
                                    icon={<Wrench size={22} strokeWidth={1.75} />}
                                    title="No tickets yet"
                                    body="When a shop opens a job for your car, it shows up here with its status."
                                />
                            ) : (
                                <ul className={`g-rows ${s.cardRows}`}>
                                    {recentTickets.map((t) => (
                                        <Row
                                            key={t.id}
                                            href={`/me/tickets/${t.id}`}
                                            label={t.shop?.name ?? 'Shop'}
                                            sub={
                                                <>
                                                    {[t.car_year, t.car_make, t.car_model].filter(Boolean).join(' ') || '—'}
                                                    {t.ticket_id ? <> · <span className="g-w" style={{ fontSize: 10.5 }}>{t.ticket_id}</span></> : null}
                                                </>
                                            }
                                            trailing={<StatusChip status={t.status} />}
                                        />
                                    ))}
                                </ul>
                            )}
                        </Card>

                        <Card as="section" aria-labelledby="ra-h">
                            <CardHead
                                id="ra-h"
                                title="Recent appointments"
                                action={
                                    <Link href="/me/appointments" className="g-link">
                                        All
                                        <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
                                    </Link>
                                }
                            />
                            {recentAppts.length === 0 ? (
                                <Empty
                                    icon={<CalendarClock size={22} strokeWidth={1.75} />}
                                    title="No appointments yet"
                                    body="Book a shop from its page and your request lands here."
                                    action={<SecButton href="/shops">Browse shops</SecButton>}
                                />
                            ) : (
                                <ul className={`g-rows ${s.cardRows}`}>
                                    {recentAppts.map((a) => (
                                        <Row
                                            key={a.id}
                                            label={a.service_type ?? 'Request'}
                                            sub={`${a.shop?.name ?? 'Shop'} · ${fmtDate(a.preferred_at)}`}
                                            trailing={<StatusChip status={a.status} />}
                                        />
                                    ))}
                                </ul>
                            )}
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
