/**
 * /me/orders — the member's Medusa orders (ecosystem checkout), attributed to
 * the Rollout sales channel. The Supabase session token is exchanged server-side
 * for a Medusa customer JWT (loadMyOrders). A fresh identity with no linked
 * Medusa customer renders a graceful empty state — the exchange still validates
 * the plumbing.
 *
 * Glide (board G5 "Orders"): one card per order — number, date and seller,
 * total and status chips, its lines, and the way into the detail.
 */
import Link from 'next/link';
import { ChevronRight, Package, Ticket, Unplug } from 'lucide-react';
import { requireConsumer } from '@/lib/me-guard';
import { loadMyOrders, formatMoney } from '@/lib/medusa-customer';
import { fmtDay, statusVariant } from '../ui';
import { EmptyState, PageHead, StatusChip, statusLabel, toneFromVariant } from '@/components/glide-tickets/parts';
import { GlideButton } from '@/components/glide/primitives';

export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
    await requireConsumer('/me/orders');
    const { orders, note, exchanged } = await loadMyOrders();

    return (
        <div className="glide glide-page gt-page--me">
            <PageHead title="Orders" sub="Your purchases: store orders and event packages." />

            {orders.length === 0 ? (
                <EmptyState
                    icon={exchanged ? <Package size={28} strokeWidth={1.5} /> : <Unplug size={28} strokeWidth={1.5} />}
                    title={exchanged ? 'No orders yet' : 'Store account not connected'}
                    action={exchanged && !note ? <GlideButton href="/store">Browse the store</GlideButton> : undefined}
                >
                    {note ? note : exchanged ? 'When you order from a Rollout shop, it shows up here.' : null}
                </EmptyState>
            ) : (
                <ul className="gt-list">
                    {orders.map((o) => (
                        <li key={o.id}>
                            <Link href={`/me/orders/${o.id}`} className="g-card gt-order">
                                <span className="gt-order-h">
                                    <span className="g-ic" aria-hidden="true">
                                        {o.is_event ? <Ticket size={20} strokeWidth={1.75} /> : <Package size={20} strokeWidth={1.75} />}
                                    </span>
                                    <span className="gt-li-t">
                                        <b>#{o.display_id ?? o.id.slice(-8)}</b>
                                        <small>
                                            {fmtDay(o.created_at)}
                                            {o.is_event ? ' · Event package' : o.vendor ? ` · ${o.vendor}` : ''}
                                        </small>
                                    </span>
                                    <span className="gt-li-r is-keep">
                                        <span className="g-w">{formatMoney(o.total, o.currency_code)}</span>
                                        <span className="gt-statuses">
                                            {o.payment_status && (
                                                <StatusChip label={statusLabel(o.payment_status)} tone={toneFromVariant(statusVariant(o.payment_status))} />
                                            )}
                                            {o.fulfillment_status && (
                                                <StatusChip
                                                    label={statusLabel(o.fulfillment_status)}
                                                    tone={toneFromVariant(statusVariant(o.fulfillment_status))}
                                                />
                                            )}
                                        </span>
                                    </span>
                                </span>

                                {o.items.length > 0 && (
                                    <span className="gt-lines" style={{ display: 'block' }}>
                                        {o.items.map((it) => (
                                            <span key={it.id} className="gt-line">
                                                <span className="gt-thumb" aria-hidden="true">
                                                    {it.thumbnail ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img src={it.thumbnail} alt="" />
                                                    ) : (
                                                    <Package size={20} strokeWidth={1.5} />
                                                )}
                                                </span>
                                                <span className="gt-line-t">
                                                    <b>{it.title ?? 'Item'}</b>
                                                    <small>Qty {it.quantity ?? 1}</small>
                                                </span>
                                                <span className="gt-line-v g-w">{formatMoney(it.unit_price, o.currency_code)}</span>
                                            </span>
                                        ))}
                                    </span>
                                )}
                                <span className="gt-order-f">
                                    View details
                                    <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
