'use client';
/**
 * Vendor-scoped orders table with a status filter and unfulfilled-first sort.
 * Read-only here — row click navigates to the detail view where actions live.
 * Glide: 44px filter chips and the G3 table, where the whole row is the link.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { VendorOrderListItem } from '@/lib/medusa-admin';
import { LinkPending } from '@/components/feedback';
import { fmtMoney, fmtDate, maskEmail, StatusChip } from './ui';
import { Archive, Package } from 'lucide-react';
import { CardEmpty, cx } from '@/components/glide-shopbiz/parts';
import bz from '@/components/glide-shopbiz/biz.module.css';
import cs from '@/components/glide-console/console.module.css';

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
    { key: 'all', label: 'All' },
    { key: 'unfulfilled', label: 'Unfulfilled' },
    { key: 'shipped', label: 'Shipped' },
    { key: 'canceled', label: 'Canceled' },
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
    /**
     * Archived orders are hidden by default. Archive is where a closed or
     * cleaned-up order goes, so on a store with any history behind it the
     * unfiltered list is mostly things nobody needs to look at again — UNITY's
     * first view was 99 archived test orders. They are one click away, never
     * gone (Ethan, 2026-09-08).
     */
    const [showArchived, setShowArchived] = useState(false);

    const archivedCount = useMemo(
        () => orders.filter((o) => String(o.status ?? '').toLowerCase() === 'archived').length,
        [orders],
    );

    const rows = useMemo(() => {
        const visible = showArchived
            ? orders
            : orders.filter((o) => String(o.status ?? '').toLowerCase() !== 'archived');
        const filtered = visible.filter((o) => matchesFilter(o, filter));
        return [...filtered].sort((a, b) => {
            const r = sortRank(a) - sortRank(b);
            if (r !== 0) return r;
            // Newest first within a rank.
            const an = Number(a.display_id ?? 0);
            const bn = Number(b.display_id ?? 0);
            return bn - an;
        });
    }, [orders, filter, showArchived]);

    return (
        <>
            <div className={bz.bar}>
                <div className={bz.chips} role="group" aria-label="Filter orders">
                    {FILTERS.map((f) => (
                        <button
                            key={f.key}
                            type="button"
                            className={bz.fchip}
                            aria-pressed={filter === f.key}
                            onClick={() => setFilter(f.key)}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                {archivedCount > 0 && (
                    <button
                        type="button"
                        className={bz.fchip}
                        aria-pressed={showArchived}
                        onClick={() => setShowArchived((v) => !v)}
                    >
                        <Archive size={16} strokeWidth={2} aria-hidden="true" />
                        {showArchived ? 'Hide archived' : 'Show archived'}
                        <span className={bz.n}>{archivedCount}</span>
                    </button>
                )}
            </div>

            <section className="g-card" aria-label="Orders">
                {rows.length === 0 ? (
                    <CardEmpty
                        icon={<Package size={22} strokeWidth={1.75} />}
                        title={orders.length === 0 ? 'No orders yet' : 'No orders match this filter'}
                        body={
                            archivedCount > 0 && !showArchived
                                ? `${archivedCount} archived ${archivedCount === 1 ? 'order is' : 'orders are'} hidden. Show archived to see ${archivedCount === 1 ? 'it' : 'them'}.`
                                : orders.length === 0
                                  ? 'Orders for this shop’s products show up here, unfulfilled first.'
                                  : 'Pick another filter to see the rest.'
                        }
                    />
                ) : (
                    <div className={cs.tblWrap}>
                        <table className={cx(cs.tbl, cs.rowLink)}>
                            <thead>
                                <tr>
                                    <th scope="col">Order</th>
                                    <th scope="col" className={cs.mHide}>
                                        Date
                                    </th>
                                    <th scope="col" className={cs.mHide}>
                                        Customer
                                    </th>
                                    <th scope="col" style={{ textAlign: 'right' }}>
                                        Total
                                    </th>
                                    <th scope="col">Payment</th>
                                    <th scope="col">Fulfillment</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((o) => (
                                    <tr key={o.id}>
                                        <td>
                                            <div className={cs.cell}>
                                                <span className="g-ic g-ic--sm" aria-hidden="true">
                                                    <Package size={17} strokeWidth={2} />
                                                </span>
                                                <span style={{ minWidth: 0 }}>
                                                    <Link href={`/shop/${slug}/orders/${o.id}`} className={cx(cs.stretch, bz.idLink)}>
                                                        #{o.display_id ?? o.id.slice(-6)}
                                                        <LinkPending />
                                                    </Link>
                                                    <small className={bz.clip}>{o.itemsSummary}</small>
                                                    <small className={bz.mOnly}>
                                                        {fmtDate(o.created_at)} · {maskEmail(o.email)}
                                                    </small>
                                                </span>
                                            </div>
                                        </td>
                                        <td className={cs.mHide} style={{ whiteSpace: 'nowrap' }}>
                                            {fmtDate(o.created_at)}
                                        </td>
                                        <td className={cs.mHide}>
                                            <span className={bz.muted}>{maskEmail(o.email)}</span>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <span className={cs.num}>{fmtMoney(o.total, o.currency_code)}</span>
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
            </section>
        </>
    );
}
