/**
 * /me/tickets — every ticket for the member's customer identity, across all
 * shops. RLS (rollout_me_tickets_select) is the gate: this list can only ever
 * contain the caller's own tickets.
 *
 * Glide: a list of rows (wrench roundel · ticket number · shop and vehicle ·
 * status chip · chevron).
 */
import Link from 'next/link';
import { ChevronRight, Wrench } from 'lucide-react';
import { requireConsumer } from '@/lib/me-guard';
import { loadMyTickets } from '@/lib/me-data';
import { fmtDay, money, statusVariant } from '../ui';
import { EmptyState, PageHead, StatusChip, statusLabel, toneFromVariant } from '@/components/glide-tickets/parts';

export const dynamic = 'force-dynamic';

export default async function TicketsPage() {
    await requireConsumer('/me/tickets');
    const tickets = await loadMyTickets();

    return (
        <div className="glide glide-page gt-page--me">
            <PageHead title="Tickets" sub="Your jobs across every Rollout shop." />

            {tickets.length === 0 ? (
                <EmptyState icon={<Wrench size={28} strokeWidth={1.5} />} title="No tickets yet">
                    When a shop opens a job for your car, it shows up here.
                </EmptyState>
            ) : (
                <ul className="gt-list">
                    {tickets.map((t) => (
                        <li key={t.id}>
                            <Link href={`/me/tickets/${t.id}`} className="gt-li">
                                <span className="g-ic" aria-hidden="true">
                                    <Wrench size={20} strokeWidth={1.75} />
                                </span>
                                <span className="gt-li-t">
                                    <b className="g-w">{t.ticket_id ?? '—'}</b>
                                    <small>
                                        {t.shop?.name ?? 'Shop'} ·{' '}
                                        {[t.car_year, t.car_make, t.car_model].filter(Boolean).join(' ') || 'Vehicle'}
                                    </small>
                                    <small>
                                        {t.service_day ? `Service ${fmtDay(t.service_day)}` : `Opened ${fmtDay(t.created_at)}`}
                                        {t.total_price != null ? ` · ${money(t.total_price)}` : ''}
                                    </small>
                                </span>
                                {t.status ? (
                                    <span className="gt-li-r is-keep">
                                        <StatusChip label={statusLabel(t.status)} tone={toneFromVariant(statusVariant(t.status))} />
                                    </span>
                                ) : null}
                                <ChevronRight className="g-row-ch" size={20} strokeWidth={2} aria-hidden="true" />
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
