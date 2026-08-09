/**
 * /me/appointments — the member's appointment requests across all shops, with a
 * status timeline (pending → accepted / reschedule / declined / converted) and
 * the linked shop name. Sourced from rollout.appointment_requests, scoped to the
 * caller's profile id.
 */
import Link from 'next/link';
import { requireConsumer } from '@/lib/me-guard';
import { loadMyAppointments } from '@/lib/me-data';
import { fmtDate, StatusPill, EmptyRow } from '../ui';

export const dynamic = 'force-dynamic';

const STAGES = ['pending', 'accepted', 'converted'] as const;

function stageIndex(status: string | null): number {
    const s = (status ?? '').toLowerCase();
    if (s === 'converted') return 2;
    if (s === 'accepted') return 1;
    if (s === 'pending' || s === 'reschedule') return 0;
    return -1; // declined / cancelled → off the happy path
}

export default async function AppointmentsPage() {
    const profile = await requireConsumer('/me/appointments');
    const appts = await loadMyAppointments(profile.profileId);

    return (
        <div>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">APPOINTMENTS</div>
                    <div className="admin-page-sub text-dim">
                        Your booking requests across every Rollout shop.
                    </div>
                </div>
            </div>

            {appts.length === 0 ? (
                <EmptyRow text="NO APPOINTMENT REQUESTS YET" />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {appts.map((a) => {
                        const active = stageIndex(a.status);
                        const offPath = active < 0;
                        return (
                            <section
                                key={a.id}
                                style={{ border: '1px solid var(--line)', background: 'var(--bg-1)', padding: 16 }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        justifyContent: 'space-between',
                                        gap: 12,
                                        flexWrap: 'wrap',
                                    }}
                                >
                                    <div>
                                        <div style={{ color: 'var(--text)', fontSize: 15 }}>
                                            {a.service_type ?? 'Service request'}
                                        </div>
                                        <div className="text-dim" style={{ fontSize: 12, marginTop: 2 }}>
                                            {a.shop?.name ?? 'Shop'}
                                            {a.vehicle ? ` · ${a.vehicle}` : ''}
                                        </div>
                                        <div className="text-dim" style={{ fontSize: 11, marginTop: 2 }}>
                                            Preferred: {fmtDate(a.preferred_at)}
                                        </div>
                                    </div>
                                    <StatusPill status={a.status} />
                                </div>

                                {/* Stage timeline */}
                                {!offPath ? (
                                    <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                                        {STAGES.map((stage, i) => (
                                            <div
                                                key={stage}
                                                style={{
                                                    flex: '1 1 90px',
                                                    padding: '6px 8px',
                                                    border: '1px solid var(--line)',
                                                    background: i <= active ? 'rgba(232,168,69,0.12)' : 'var(--bg-2)',
                                                    borderLeft:
                                                        i <= active ? '2px solid var(--gold)' : '1px solid var(--line)',
                                                    fontFamily: 'var(--font-display)',
                                                    fontSize: 9,
                                                    letterSpacing: 'var(--track-wider)',
                                                    color: i <= active ? 'var(--gold)' : 'var(--text-3)',
                                                    textTransform: 'uppercase',
                                                }}
                                            >
                                                {stage}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    a.decline_reason && (
                                        <div
                                            className="text-dim"
                                            style={{ fontSize: 12, marginTop: 12, color: 'var(--warn, var(--text-2))' }}
                                        >
                                            Reason: {a.decline_reason}
                                        </div>
                                    )
                                )}

                                {a.notes && (
                                    <div className="text-dim" style={{ fontSize: 12, marginTop: 12 }}>
                                        {a.notes}
                                    </div>
                                )}

                                {a.ticket_id && (
                                    <div style={{ marginTop: 12 }}>
                                        <Link
                                            href={`/me/tickets/${a.ticket_id}`}
                                            className="admin-action-btn"
                                            style={{ textDecoration: 'none' }}
                                        >
                                            VIEW TICKET ›
                                        </Link>
                                    </div>
                                )}
                            </section>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
