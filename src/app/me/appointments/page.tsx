/**
 * /me/appointments — the member's appointment requests across all shops, with a
 * status timeline (pending → accepted / reschedule / declined / converted) and
 * the linked shop name. Sourced from rollout.appointment_requests, scoped to the
 * caller's profile id.
 *
 * Glide: each request is a card with its status chip, a three-step track and
 * the ticket link once the shop opens one. Same loader.
 */
import { CalendarClock, Car, Check, CircleCheck, MessageSquareText, Store, Wrench } from 'lucide-react';
import { requireConsumer } from '@/lib/me-guard';
import { loadMyAppointments } from '@/lib/me-data';
import { fmtDate } from '../ui';
import { Card, GlideButton, SecButton } from '@/components/glide/primitives';
import { ConsoleHead, Empty, StatusChip } from '@/components/glide-console/parts';
import s from '@/components/glide-console/console.module.css';
import a from './appointments.module.css';

export const dynamic = 'force-dynamic';

const STAGES = [
    { key: 'pending', label: 'Requested' },
    { key: 'accepted', label: 'Accepted' },
    { key: 'converted', label: 'Ticket opened' },
] as const;

function stageIndex(status: string | null): number {
    const s = (status ?? '').toLowerCase();
    if (s === 'converted') return 2;
    if (s === 'accepted') return 1;
    if (s === 'pending' || s === 'reschedule') return 0;
    return -1; // declined / cancelled → off the happy path
}

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ requested?: string }> }) {
    const profile = await requireConsumer('/me/appointments');
    // ?requested=<shop handle> — straight from /book/<shop>: say it landed.
    const { requested } = await searchParams;
    const requestedHandle = requested ? requested.replace(/[^a-z0-9_-]/gi, '').slice(0, 40) : '';
    const appts = await loadMyAppointments(profile.profileId);
    const ic = { size: 16, strokeWidth: 2, 'aria-hidden': true } as const;

    return (
        <div className={s.scope}>
            {requestedHandle ? (
                <p className={`g-note ${s.note}`} role="status">
                    <CircleCheck size={20} strokeWidth={2} aria-hidden="true" />
                    Request sent to @{requestedHandle} — they&apos;ll confirm a time from their console.
                </p>
            ) : null}
            <ConsoleHead title="Appointments" sub="Your booking requests across every Rollout shop." />

            {appts.length === 0 ? (
                <Card>
                    <Empty
                        icon={<CalendarClock size={22} strokeWidth={1.75} />}
                        title="No appointment requests yet"
                        action={<GlideButton href="/shops" size="sm">Find a shop</GlideButton>}
                    />
                </Card>
            ) : (
                <ul className={a.list}>
                    {appts.map((ap, i) => {
                        const active = stageIndex(ap.status);
                        const offPath = active < 0;
                        return (
                            <li key={ap.id}>
                                <Card as="article" edge={i === 0 && !offPath} className={a.appt} aria-labelledby={`ap-${ap.id}`}>
                                    <div className={a.top}>
                                        <div style={{ minWidth: 0 }}>
                                            <h2 id={`ap-${ap.id}`} className={a.title}>
                                                {ap.service_type ?? 'Service request'}
                                            </h2>
                                            <p className={a.meta}>
                                                <span>
                                                    <Store {...ic} />
                                                    {ap.shop?.name ?? 'Shop'}
                                                </span>
                                                {ap.vehicle ? (
                                                    <span>
                                                        <Car {...ic} />
                                                        {ap.vehicle}
                                                    </span>
                                                ) : null}
                                            </p>
                                            <p className={a.meta}>
                                                <span>
                                                    <CalendarClock {...ic} />
                                                    Preferred: {fmtDate(ap.preferred_at)}
                                                </span>
                                            </p>
                                        </div>
                                        <StatusChip status={ap.status} />
                                    </div>

                                    {!offPath ? (
                                        <ol className={a.steps} aria-label="Progress">
                                            {STAGES.map((stage, si) => {
                                                const state = si < active ? 'done' : si === active ? 'now' : 'next';
                                                return (
                                                    <li key={stage.key} className={a[state]} aria-current={state === 'now' ? 'step' : undefined}>
                                                        <span className={a.dot} aria-hidden="true">
                                                            {state === 'done' ? <Check size={13} strokeWidth={3} /> : null}
                                                        </span>
                                                        {stage.label}
                                                    </li>
                                                );
                                            })}
                                        </ol>
                                    ) : ap.decline_reason ? (
                                        <p className={a.reason}>
                                            <MessageSquareText size={17} strokeWidth={2} aria-hidden="true" />
                                            <span>
                                                <b>Reason</b> {ap.decline_reason}
                                            </span>
                                        </p>
                                    ) : null}

                                    {ap.notes ? <p className={a.notes}>{ap.notes}</p> : null}

                                    {ap.ticket_id ? (
                                        <div className={a.foot}>
                                            <SecButton href={`/me/tickets/${ap.ticket_id}`}>
                                                <Wrench size={17} strokeWidth={2} aria-hidden="true" />
                                                View ticket
                                            </SecButton>
                                        </div>
                                    ) : null}
                                </Card>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
