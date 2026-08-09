/**
 * /me/tickets — every ticket for the member's customer identity, across all
 * shops. RLS (rollout_me_tickets_select) is the gate: this list can only ever
 * contain the caller's own tickets.
 */
import Link from 'next/link';
import { requireConsumer } from '@/lib/me-guard';
import { loadMyTickets } from '@/lib/me-data';
import { fmtDay, StatusPill, EmptyRow, money } from '../ui';

export const dynamic = 'force-dynamic';

export default async function TicketsPage() {
    await requireConsumer('/me/tickets');
    const tickets = await loadMyTickets();

    return (
        <div>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">TICKETS</div>
                    <div className="admin-page-sub text-dim">
                        Your jobs across every Rollout shop.
                    </div>
                </div>
            </div>

            {tickets.length === 0 ? (
                <EmptyRow text="NO TICKETS YET" />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {tickets.map((t) => (
                        <Link
                            key={t.id}
                            href={`/me/tickets/${t.id}`}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'minmax(0,1fr) auto',
                                gap: 12,
                                alignItems: 'center',
                                border: '1px solid var(--line)',
                                background: 'var(--bg-1)',
                                padding: 14,
                                textDecoration: 'none',
                            }}
                        >
                            <div style={{ minWidth: 0 }}>
                                <div
                                    style={{
                                        color: 'var(--text)',
                                        fontSize: 14,
                                        fontFamily: 'var(--font-mono, monospace)',
                                    }}
                                >
                                    {t.ticket_id ?? '—'}
                                </div>
                                <div className="text-dim" style={{ fontSize: 12, marginTop: 2 }}>
                                    {t.shop?.name ?? 'Shop'} ·{' '}
                                    {[t.car_year, t.car_make, t.car_model].filter(Boolean).join(' ') || 'Vehicle'}
                                </div>
                                <div className="text-dim" style={{ fontSize: 11, marginTop: 2 }}>
                                    {t.service_day ? `Service ${fmtDay(t.service_day)}` : `Opened ${fmtDay(t.created_at)}`}
                                    {t.total_price != null ? ` · ${money(t.total_price)}` : ''}
                                </div>
                            </div>
                            <StatusPill status={t.status} />
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
