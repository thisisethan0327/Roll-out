/**
 * /me/orders — the member's Medusa orders (ecosystem checkout), attributed to
 * the Rollout sales channel. The Supabase session token is exchanged server-side
 * for a Medusa customer JWT (loadMyOrders). A fresh identity with no linked
 * Medusa customer renders a graceful empty state — the exchange still validates
 * the plumbing.
 */
import { requireConsumer } from '@/lib/me-guard';
import { loadMyOrders, formatMoney } from '@/lib/medusa-customer';
import { fmtDay, StatusPill, EmptyRow } from '../ui';

export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
    await requireConsumer('/me/orders');
    const { orders, note, exchanged } = await loadMyOrders();

    return (
        <div>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">ORDERS</div>
                    <div className="admin-page-sub text-dim">
                        Your purchases across the Rollout store.
                    </div>
                </div>
            </div>

            {orders.length === 0 ? (
                <div>
                    <EmptyRow text={exchanged ? 'NO ORDERS YET' : 'STORE ACCOUNT NOT CONNECTED'} />
                    {note && (
                        <div className="text-dim" style={{ fontSize: 12, marginTop: 8 }}>
                            {note}
                        </div>
                    )}
                    {exchanged && !note && (
                        <div className="text-dim" style={{ fontSize: 12, marginTop: 8 }}>
                            When you order from a Rollout shop, it shows up here.
                        </div>
                    )}
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {orders.map((o) => (
                        <section
                            key={o.id}
                            style={{ border: '1px solid var(--line)', background: 'var(--bg-1)', padding: 16 }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'flex-start',
                                    gap: 12,
                                    flexWrap: 'wrap',
                                }}
                            >
                                <div>
                                    <div
                                        style={{
                                            color: 'var(--text)',
                                            fontSize: 14,
                                            fontFamily: 'var(--font-mono, monospace)',
                                        }}
                                    >
                                        #{o.display_id ?? o.id.slice(-8)}
                                    </div>
                                    <div className="text-dim" style={{ fontSize: 11, marginTop: 2 }}>
                                        {fmtDay(o.created_at)}
                                        {o.vendor ? ` · ${o.vendor}` : ''}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div
                                        style={{
                                            fontFamily: 'var(--font-mono, monospace)',
                                            color: 'var(--gold)',
                                            fontSize: 15,
                                        }}
                                    >
                                        {formatMoney(o.total, o.currency_code)}
                                    </div>
                                    <div style={{ display: 'flex', gap: 4, marginTop: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                        {o.payment_status && <StatusPill status={o.payment_status} />}
                                        {o.fulfillment_status && <StatusPill status={o.fulfillment_status} />}
                                    </div>
                                </div>
                            </div>

                            {o.items.length > 0 && (
                                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {o.items.map((it) => (
                                        <div
                                            key={it.id}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 10,
                                                borderTop: '1px solid var(--line)',
                                                paddingTop: 8,
                                            }}
                                        >
                                            {it.thumbnail ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={it.thumbnail}
                                                    alt=""
                                                    style={{
                                                        width: 40,
                                                        height: 40,
                                                        objectFit: 'cover',
                                                        border: '1px solid var(--line)',
                                                    }}
                                                />
                                            ) : (
                                                <div
                                                    style={{
                                                        width: 40,
                                                        height: 40,
                                                        background: 'var(--bg-2)',
                                                        border: '1px solid var(--line)',
                                                    }}
                                                />
                                            )}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 13, color: 'var(--text)' }}>
                                                    {it.title ?? 'Item'}
                                                </div>
                                                <div className="text-dim" style={{ fontSize: 11 }}>
                                                    Qty {it.quantity ?? 1}
                                                </div>
                                            </div>
                                            <div
                                                className="text-dim"
                                                style={{ fontSize: 12, fontFamily: 'var(--font-mono, monospace)' }}
                                            >
                                                {formatMoney(it.unit_price, o.currency_code)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}
