'use client';
/**
 * Vendor-scoped orders table with a status filter and unfulfilled-first sort.
 * Read-only here — row click navigates to the detail view where actions live.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { VendorOrderListItem } from '@/lib/medusa-admin';
import { LinkPending } from '@/components/feedback';
import { fmtMoney, fmtDate, maskEmail, StatusChip } from './ui';

type Filter = 'all' | 'unfulfilled' | 'shipped' | 'canceled';

/** Rank for the default sort: unfulfilled + active first, canceled last. */
function sortRank(o: VendorOrderListItem): number {
    const status = (o.status ?? '').toLowerCase();
    const ful = (o.fulfillment_status ?? '').toLowerCase();
    if (status === 'canceled') return 3;
    if (ful === 'delivered') return 2;
    if (['shipped', 'partially_shipped', 'fulfilled', 'partially_fulfilled'].includes(ful))
        return 1;
    return 0; // not_fulfilled / active — surface first
}

function matchesFilter(o: VendorOrderListItem, f: Filter): boolean {
    const status = (o.status ?? '').toLowerCase();
    const ful = (o.fulfillment_status ?? '').toLowerCase();
    switch (f) {
        case 'unfulfilled':
            return status !== 'canceled' && (ful === 'not_fulfilled' || ful === 'partially_fulfilled');
        case 'shipped':
            return ['shipped', 'partially_shipped', 'delivered'].includes(ful);
        case 'canceled':
            return status === 'canceled';
        default:
            return true;
    }
}

const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'ALL' },
    { key: 'unfulfilled', label: 'UNFULFILLED' },
    { key: 'shipped', label: 'SHIPPED' },
    { key: 'canceled', label: 'CANCELED' },
];

export function OrdersList({
    slug,
    orders,
}: {
    slug: string;
    orders: VendorOrderListItem[];
    callerRole: string;
}) {
    const [filter, setFilter] = useState<Filter>('all');

    const rows = useMemo(() => {
        const filtered = orders.filter((o) => matchesFilter(o, filter));
        return [...filtered].sort((a, b) => {
            const r = sortRank(a) - sortRank(b);
            if (r !== 0) return r;
            // Newest first within a rank.
            const an = Number(a.display_id ?? 0);
            const bn = Number(b.display_id ?? 0);
            return bn - an;
        });
    }, [orders, filter]);

    return (
        <div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                {FILTERS.map((f) => (
                    <button
                        key={f.key}
                        type="button"
                        className={`admin-action-btn ${filter === f.key ? '' : 'muted'}`}
                        onClick={() => setFilter(f.key)}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {rows.length === 0 ? (
                <div className="admin-empty">NO ORDERS</div>
            ) : (
                <div className="admin-table-wrap">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>ORDER</th>
                                <th>DATE</th>
                                <th>CUSTOMER</th>
                                <th>ITEMS</th>
                                <th style={{ textAlign: 'right' }}>TOTAL</th>
                                <th>PAYMENT</th>
                                <th>FULFILLMENT</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((o) => (
                                <tr key={o.id} style={{ cursor: 'pointer' }}>
                                    <td>
                                        <Link
                                            href={`/shop/${slug}/orders/${o.id}`}
                                            className="text-link"
                                            style={{
                                                fontFamily: 'var(--font-mono, monospace)',
                                                color: 'var(--gold)',
                                                textDecoration: 'none',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 8,
                                            }}
                                        >
                                            #{o.display_id ?? o.id.slice(-6)}
                                            <LinkPending />
                                        </Link>
                                    </td>
                                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(o.created_at)}</td>
                                    <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>
                                        {maskEmail(o.email)}
                                    </td>
                                    <td style={{ maxWidth: 220 }}>
                                        <span className="admin-handle">{o.itemsSummary}</span>
                                    </td>
                                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>
                                        {fmtMoney(o.total, o.currency_code)}
                                    </td>
                                    <td>
                                        <StatusChip status={o.payment_status} />
                                    </td>
                                    <td>
                                        {o.status === 'canceled' ? (
                                            <StatusChip status="canceled" />
                                        ) : (
                                            <StatusChip status={o.fulfillment_status} />
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
