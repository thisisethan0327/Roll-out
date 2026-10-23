/**
 * /me/events/[id] — host's own event detail: edit form, cancel, invitations,
 * and a log of invites already sent (from email_log). Ownership enforced:
 * host_id = caller, shop_id null; otherwise notFound.
 *
 * Glide (board: G3 web host console): the event summary card on top, the form
 * in section cards with a sticky save bar, the sections as rows beside it, then
 * the door list, invitations and the sent log. Same loads and actions.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarDays, CircleCheck, ExternalLink, Globe, Hash, Lock, Route, Users, CircleX } from 'lucide-react';
import { requireVerifiedHost } from '@/lib/me-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { eventHasPaidExposure } from '@/lib/event-refund';
import type { InviteBranding, InviteEvent } from '@/lib/event-invites';
import { HostEventEditForm } from './HostEventEditForm';
import { loadEventAreaLabel } from '@/lib/event-area-label';
import { HostInviteSection } from './HostInviteSection';
import { DoorSection } from '@/components/DoorSection';
import { hostDoorCheckInAction } from '../door-actions';
import { resolveCover, coverFocus } from '@/lib/event-covers';
import { eventDateParts, eventTypeLabel, placeName } from '@/lib/glide-format';
import { Card, Chip, Row, SecButton } from '@/components/glide/primitives';
import { CardHead } from '@/components/glide-console/parts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import s from '@/components/glide-console/console.module.css';
import h from './host-event.module.css';

export const metadata = { title: 'Edit Event' };
export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = {
    NIGHT_RUN: 'NIGHT RUN',
    CAR_MEET: 'CAR MEET',
    TRACK_DAY: 'TRACK DAY',
    CRUISE: 'CRUISE',
    SHOW: 'SHOW',
};

const VIS: Record<string, { label: string; icon: typeof Globe }> = {
    public: { label: 'Public', icon: Globe },
    followers: { label: 'Followers', icon: Users },
    private: { label: 'Private', icon: Lock },
};

export default async function HostEventDetail({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ just_created?: string }>;
}) {
    const { id } = await params;
    const { just_created } = await searchParams;
    const profile = await requireVerifiedHost('/me/events');
    const admin = getSupabaseAdmin();

    const { data, error } = await admin
        .from('events')
        .select(
            'id, shop_id, host_id, code, type, title, description, location_name, location_detail, lat, lng, start_at, capacity, rsvp_mode, visibility, tags, hero_image_url, cancelled_at, destination_name, destination_lat, destination_lng, route_plan',
        )
        .eq('id', id)
        .maybeSingle();
    if (error) console.error('[me/events/[id]] event load failed:', error.message);
    const event = data as any;
    if (!event || event.host_id !== profile.profileId || event.shop_id != null) notFound();
    // area_label (089) read separately so the page still loads before it exists.
    event.area_label = await loadEventAreaLabel(admin, id);

    // Paid-exposure check (077) — gates which cancel control the edit form
    // shows: "CANCEL EVENT & REFUND EVERYONE" (paid) vs the plain cancel
    // (free). Same signal cancelHostEvent's own guard uses, so the UI and
    // the server-side refusal never disagree.
    const isPaidEvent = await eventHasPaidExposure(event.id);

    // Invites already sent (audit) for this event.
    const { data: sentRows, error: sentError } = await admin
        .from('email_log')
        .select('recipient_email, status, created_at')
        .eq('linked_event_id', id)
        .eq('template', 'platform_host_invite')
        .order('created_at', { ascending: false })
        .limit(50);
    if (sentError) console.error('[me/events/[id]] sent-invites load failed:', sentError.message);
    const sent = (sentRows as any[]) ?? [];

    const branding: InviteBranding = {
        shopName: 'Rollout',
        fromName: profile.displayName || profile.handle,
        logoUrl: null,
        primaryColor: '#e8a845',
        secondaryColor: '#e8a845',
        supportEmail: null,
        pageHandle: profile.handle,
    };
    const inviteEvent: InviteEvent = {
        id: event.id,
        title: event.title,
        typeLabel: TYPE_LABEL[event.type] ?? String(event.type ?? 'EVENT').replace(/_/g, ' '),
        startAtISO: event.start_at,
        locationName: event.location_name ?? '',
        locationDetail: event.location_detail ?? null,
        code: event.code ?? null,
        description: event.description ?? null,
    };

    const justCreated = just_created === '1';
    const cancelled = !!event.cancelled_at;
    const when = eventDateParts(event.start_at);
    const vis = VIS[event.visibility ?? 'public'] ?? VIS.public;
    const VisIcon = vis.icon;
    const ticketed = event.rsvp_mode === 'tiered' || event.rsvp_mode === 'paid';
    const chipIc = { size: 15, strokeWidth: 2, 'aria-hidden': true } as const;
    const rowIc = { size: 20, strokeWidth: 1.75, 'aria-hidden': true } as const;
    const chev = <ChevronRight className="g-row-ch" size={18} strokeWidth={2} aria-hidden="true" />;
    const place = placeName(event.location_name);

    const JUMP = [
        { href: '#details', label: 'Details' },
        { href: '#location', label: 'Location' },
        { href: '#when', label: 'When & capacity' },
        { href: '#visibility', label: 'Visibility & tags' },
        { href: '#cover', label: 'Cover' },
        { href: '#route', label: 'Route' },
        ...(ticketed ? [{ href: '#door-list', label: 'Tickets & door list' }] : []),
        ...(!cancelled ? [{ href: '#invitations', label: 'Invitations' }] : []),
        ...(sent.length > 0 ? [{ href: '#sent', label: 'Invites sent' }] : []),
    ];

    return (
        <div className={s.scope}>
            {justCreated ? (
                <p className={`g-note ${s.note}`} role="status">
                    <CircleCheck size={20} strokeWidth={2} aria-hidden="true" />
                    <span style={{ flex: 1 }}>Event created.</span>
                    <a href="#route" className="g-link">
                        <Route size={16} strokeWidth={2} aria-hidden="true" />
                        Plan the route
                    </a>
                </p>
            ) : null}

            <div>
                <Link href="/me/events" className="g-link">
                    <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
                    My events
                </Link>
            </div>

            {/* SUMMARY */}
            <Card as="section" aria-labelledby="sum-h">
                <div className={h.sum}>
                    <div
                        className={`${h.cv} g-edge${cancelled ? ` ${h.cancelled}` : ''}`}
                        style={{ backgroundImage: `url(${resolveCover(event.hero_image_url, event.type, event.id)})`, backgroundPosition: coverFocus(event.hero_image_url) }}
                        role="img"
                        aria-label="Event cover"
                    />
                    <div className={h.sumBd}>
                        <div className="g-chips">
                            {when ? (
                                <Chip large icon={<CalendarDays {...chipIc} />}>
                                    {when.dayLabel.replace(/\d+$/, '')}
                                    <span className="g-w">{when.day}</span>
                                </Chip>
                            ) : null}
                            <Chip large tint icon={<VisIcon {...chipIc} />}>
                                {vis.label}
                            </Chip>
                            {event.capacity != null ? (
                                <Chip large icon={<Users {...chipIc} />}>
                                    <span className="g-w">{event.capacity}</span> spots
                                </Chip>
                            ) : null}
                            {event.code ? (
                                <Chip large icon={<Hash {...chipIc} />}>
                                    <span className="g-w">{event.code}</span>
                                </Chip>
                            ) : null}
                            {cancelled ? (
                                <Chip large icon={<CircleX {...chipIc} />}>
                                    Cancelled
                                </Chip>
                            ) : null}
                        </div>
                        <h1 id="sum-h">{event.title ?? 'Event'}</h1>
                        <p className={h.meta}>
                            {when ? (
                                <>
                                    <span className="g-w">{when.clock}</span> {when.zone} ·{' '}
                                </>
                            ) : null}
                            {[place, event.location_detail].filter(Boolean).join(' · ') || 'Location TBA'}
                            {event.destination_name ? <> → {event.destination_name}</> : null}
                        </p>
                        <div className={h.acts}>
                            <SecButton href={`/event/${event.id}`}>
                                <ExternalLink size={17} strokeWidth={2} aria-hidden="true" />
                                View public page
                            </SecButton>
                            <a href="#route" className="g-sec">
                                <Route size={17} strokeWidth={2} aria-hidden="true" />
                                Plan the route
                            </a>
                            {!cancelled ? (
                                <a href="#invitations" className="g-sec">
                                    <Users size={17} strokeWidth={2} aria-hidden="true" />
                                    Invite people
                                </a>
                            ) : null}
                        </div>
                    </div>
                </div>
                <div style={{ height: 12 }} />
            </Card>

            <div className={s.sideR}>
                <div className={s.col}>
                    <HostEventEditForm event={event} isPaidEvent={isPaidEvent} glide />

                    <DoorSection eventId={event.id} rsvpMode={event.rsvp_mode} cancelled={cancelled} checkIn={hostDoorCheckInAction.bind(null, event.id)} />

                    {!cancelled ? <HostInviteSection eventId={event.id} branding={branding} event={inviteEvent} hostName={profile.displayName || profile.handle} /> : null}

                    {sent.length > 0 ? (
                        <Card as="section" aria-labelledby="sent-h" id="sent" style={{ scrollMarginTop: 20, paddingBottom: 6 }}>
                            <CardHead id="sent-h" title="Invites sent" sub={`${sent.length} most recent`} />
                            <div className={s.tblWrap} style={{ marginTop: 8 }}>
                                <table className={s.tbl}>
                                    <thead>
                                        <tr>
                                            <th scope="col">Email</th>
                                            <th scope="col">Status</th>
                                            <th scope="col">When</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sent.map((x, i) => (
                                            <tr key={i}>
                                                <td style={{ overflowWrap: 'anywhere' }}>{x.recipient_email}</td>
                                                <td>
                                                    <span className={`g-chip${(x.status ?? 'sent') === 'sent' ? ' g-chip--tint' : ''}`}>{String(x.status ?? 'sent').replace(/^./, (c: string) => c.toUpperCase())}</span>
                                                </td>
                                                <td style={{ color: 'var(--ink-2)' }}>{new Date(x.created_at).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    ) : null}
                </div>

                <div className={`${s.col} ${s.sticky} ${s.hideNarrow}`}>
                    <Card as="section" aria-label="On this page">
                        <ul className={`g-rows ${h.jump}`}>
                            {JUMP.map((j) => (
                                <Row key={j.href} href={j.href} label={j.label} trailing={chev} />
                            ))}
                        </ul>
                    </Card>
                    <Card as="section" aria-label="Public page">
                        <ul className={`g-rows ${h.jump}`}>
                            <Row href={`/event/${event.id}`} icon={<ExternalLink {...rowIc} />} label="Public event page" sub="What guests see" trailing={chev} />
                            <Row href="/me/events" icon={<CalendarDays {...rowIc} />} label="All my events" trailing={chev} />
                        </ul>
                    </Card>
                </div>
            </div>
        </div>
    );
}
