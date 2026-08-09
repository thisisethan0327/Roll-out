'use client';
/**
 * Editable services line items stored in tickets.services JSONB. Add/remove
 * rows, edit name/qty/price inline; Save writes the array and recomputes
 * total_price from priced items (server-side).
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateTicketServices, type ServiceLine } from './detail-actions';

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

function normalize(raw: any): ServiceLine[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((s: any) => {
        if (s && typeof s === 'object') {
            return {
                name: String(s.name ?? s.notes ?? ''),
                qty: s.qty != null ? Number(s.qty) : 1,
                price:
                    s.price != null && !Number.isNaN(Number(s.price))
                        ? Number(s.price)
                        : null,
            };
        }
        return { name: String(s), qty: 1, price: null };
    });
}

export function TicketServicesEditor({
    slug,
    ticketRowId,
    initial,
    callerRole,
}: {
    slug: string;
    ticketRowId: string;
    initial: any;
    callerRole: string;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [lines, setLines] = useState<ServiceLine[]>(normalize(initial));
    const [dirty, setDirty] = useState(false);
    const canManage = MANAGER_ROLES.has(callerRole);

    const update = (i: number, patch: Partial<ServiceLine>) => {
        setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
        setDirty(true);
    };
    const addRow = () => {
        setLines((prev) => [...prev, { name: '', qty: 1, price: null }]);
        setDirty(true);
    };
    const removeRow = (i: number) => {
        setLines((prev) => prev.filter((_, idx) => idx !== i));
        setDirty(true);
    };

    const save = () => {
        start(async () => {
            try {
                await updateTicketServices(slug, ticketRowId, lines);
                setDirty(false);
                router.refresh();
            } catch (e: any) {
                alert('Save services failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    const total = lines.reduce(
        (s, l) => (l.price != null ? s + l.price * (l.qty || 1) : s),
        0,
    );

    if (!canManage) {
        return lines.length === 0 ? (
            <div className="admin-empty">NO SERVICES LISTED</div>
        ) : (
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.65 }}>
                {lines.map((l, i) => (
                    <li key={i} style={{ fontFamily: 'var(--font-body)' }}>
                        {l.name}
                        {l.qty > 1 ? ` × ${l.qty}` : ''}
                        {l.price != null ? ` — $${(l.price * (l.qty || 1)).toFixed(2)}` : ''}
                    </li>
                ))}
            </ul>
        );
    }

    return (
        <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {lines.map((l, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                            className="admin-form-input"
                            placeholder="Service name"
                            value={l.name}
                            onChange={(e) => update(i, { name: e.target.value })}
                            style={{ flex: 1 }}
                        />
                        <input
                            className="admin-form-input"
                            type="number"
                            min={1}
                            value={l.qty}
                            onChange={(e) => update(i, { qty: Number(e.target.value) || 1 })}
                            style={{ width: 56 }}
                            aria-label="Quantity"
                        />
                        <input
                            className="admin-form-input"
                            type="number"
                            step="0.01"
                            placeholder="$"
                            value={l.price ?? ''}
                            onChange={(e) =>
                                update(i, {
                                    price: e.target.value === '' ? null : Number(e.target.value),
                                })
                            }
                            style={{ width: 90 }}
                            aria-label="Price"
                        />
                        <button
                            type="button"
                            className="admin-action-btn danger"
                            onClick={() => removeRow(i)}
                            aria-label="Remove line"
                        >
                            ✕
                        </button>
                    </div>
                ))}
            </div>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 10,
                    gap: 8,
                }}
            >
                <button type="button" className="admin-action-btn muted" onClick={addRow}>
                    + ADD LINE
                </button>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {total > 0 && (
                        <span
                            style={{
                                fontFamily: 'var(--font-mono, monospace)',
                                fontSize: 13,
                                color: 'var(--text)',
                            }}
                        >
                            ${total.toFixed(2)}
                        </span>
                    )}
                    {dirty && (
                        <button
                            type="button"
                            className="admin-action-btn"
                            disabled={pending}
                            onClick={save}
                        >
                            {pending ? 'SAVING…' : 'SAVE SERVICES'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
