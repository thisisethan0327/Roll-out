'use client';
/**
 * Shared, controlled services line-item editor. Reused by the ticket detail
 * page, the new-ticket form, and the edit flow.
 *
 * - Add lines from the shop's service catalog (cascading category → subcategory
 *   → item → option) — lazy-loaded on first open.
 * - Add free-form custom lines.
 * - Inline-edit service name, quantity, and unit price (Enter/blur commits).
 * - Running total (Σ line totals).
 *
 * Values are the shared `ServiceLine` shape (see @/lib/ticket-services), which
 * serializes to the emwraps-compatible JSONB.
 */
import { useEffect, useState, useTransition } from 'react';
import { loadServiceCatalog, type CatalogCategory } from './form-actions';
import { lineTotal, totalFromLines, type ServiceLine } from '@/lib/ticket-services';

export function ServiceLinesEditor({
    slug,
    lines,
    onChange,
    disabled,
}: {
    slug: string;
    lines: ServiceLine[];
    onChange: (next: ServiceLine[]) => void;
    disabled?: boolean;
}) {
    const [catalog, setCatalog] = useState<CatalogCategory[] | null>(null);
    const [loadingCatalog, startCatalog] = useTransition();
    const [pickerOpen, setPickerOpen] = useState(false);

    // Cascading picker selection state.
    const [cat, setCat] = useState('');
    const [sub, setSub] = useState('');
    const [itemId, setItemId] = useState('');
    const [optLabel, setOptLabel] = useState('');

    const openPicker = () => {
        setPickerOpen(true);
        if (catalog == null && !loadingCatalog) {
            startCatalog(async () => {
                try {
                    setCatalog(await loadServiceCatalog(slug));
                } catch {
                    setCatalog([]);
                }
            });
        }
    };

    const cats = catalog ?? [];
    const subs = cats.find((c) => c.category === cat)?.subcategories ?? [];
    const items = subs.find((s) => s.subcategory === sub)?.items ?? [];
    const item = items.find((i) => i.id === itemId);
    const opts = item?.options ?? [];

    const addFromCatalog = () => {
        if (!item) return;
        const opt = opts.find((o) => o.label === optLabel);
        const parts = [cat, sub, item.name, opt?.label].filter(Boolean) as string[];
        const price = opt?.price ?? item.price ?? null;
        const duration = opt?.duration ?? item.duration ?? 'Varies';
        onChange([
            ...lines,
            {
                service: parts.join(' > '),
                unitPrice: price,
                quantity: 1,
                duration: duration ?? 'Varies',
                custom: false,
            },
        ]);
        setItemId('');
        setOptLabel('');
    };

    const addCustom = () => {
        onChange([
            ...lines,
            { service: '', unitPrice: null, quantity: 1, duration: 'Varies', custom: true },
        ]);
    };

    const patch = (i: number, p: Partial<ServiceLine>) =>
        onChange(lines.map((l, idx) => (idx === i ? { ...l, ...p } : l)));
    const remove = (i: number) => onChange(lines.filter((_, idx) => idx !== i));

    const total = totalFromLines(lines);

    return (
        <div>
            {lines.length === 0 ? (
                <div className="admin-empty">NO SERVICES YET</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {lines.map((l, i) => {
                        const amt = lineTotal(l);
                        return (
                            <div
                                key={i}
                                style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}
                            >
                                <input
                                    className="admin-form-input"
                                    placeholder="Service name"
                                    value={l.service}
                                    disabled={disabled}
                                    onChange={(e) => patch(i, { service: e.target.value })}
                                    style={{ flex: 1, minWidth: 160 }}
                                />
                                <input
                                    className="admin-form-input"
                                    type="number"
                                    min={1}
                                    value={l.quantity}
                                    disabled={disabled}
                                    onChange={(e) => patch(i, { quantity: Number(e.target.value) || 1 })}
                                    style={{ width: 54 }}
                                    aria-label="Quantity"
                                />
                                <input
                                    className="admin-form-input"
                                    type="number"
                                    step="0.01"
                                    placeholder="$ unit"
                                    value={l.unitPrice ?? ''}
                                    disabled={disabled}
                                    onChange={(e) =>
                                        patch(i, {
                                            unitPrice:
                                                e.target.value === '' ? null : Number(e.target.value),
                                        })
                                    }
                                    style={{ width: 90 }}
                                    aria-label="Unit price"
                                />
                                <span
                                    style={{
                                        width: 78,
                                        textAlign: 'right',
                                        fontFamily: 'var(--font-mono, monospace)',
                                        fontSize: 12,
                                        color: 'var(--text-2)',
                                    }}
                                >
                                    {amt != null ? `$${amt.toFixed(2)}` : '—'}
                                </span>
                                <button
                                    type="button"
                                    className="admin-action-btn danger"
                                    onClick={() => remove(i)}
                                    disabled={disabled}
                                    aria-label="Remove line"
                                >
                                    ✕
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button
                    type="button"
                    className="admin-action-btn muted"
                    onClick={pickerOpen ? () => setPickerOpen(false) : openPicker}
                    disabled={disabled}
                >
                    {pickerOpen ? 'CLOSE CATALOG' : '+ FROM CATALOG'}
                </button>
                <button type="button" className="admin-action-btn muted" onClick={addCustom} disabled={disabled}>
                    + CUSTOM LINE
                </button>
                {total != null && (
                    <span
                        style={{
                            marginLeft: 'auto',
                            fontFamily: 'var(--font-mono, monospace)',
                            fontSize: 14,
                            color: 'var(--text)',
                            alignSelf: 'center',
                        }}
                    >
                        TOTAL ${total.toFixed(2)}
                    </span>
                )}
            </div>

            {pickerOpen && (
                <div
                    style={{
                        marginTop: 10,
                        border: '1px solid var(--line)',
                        background: 'var(--bg-2)',
                        padding: 12,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                    }}
                >
                    {loadingCatalog && catalog == null ? (
                        <div className="admin-empty">LOADING CATALOG…</div>
                    ) : cats.length === 0 ? (
                        <div className="admin-empty">
                            NO CATALOG SERVICES. USE + CUSTOM LINE.
                        </div>
                    ) : (
                        <>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <select
                                    className="admin-form-input"
                                    value={cat}
                                    onChange={(e) => {
                                        setCat(e.target.value);
                                        setSub('');
                                        setItemId('');
                                        setOptLabel('');
                                    }}
                                    style={{ flex: 1, minWidth: 140 }}
                                >
                                    <option value="">Category…</option>
                                    {cats.map((c) => (
                                        <option key={c.category} value={c.category}>
                                            {c.category}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    className="admin-form-input"
                                    value={sub}
                                    onChange={(e) => {
                                        setSub(e.target.value);
                                        setItemId('');
                                        setOptLabel('');
                                    }}
                                    disabled={!cat}
                                    style={{ flex: 1, minWidth: 140 }}
                                >
                                    <option value="">Subcategory…</option>
                                    {subs.map((s) => (
                                        <option key={s.subcategory} value={s.subcategory}>
                                            {s.subcategory}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <select
                                    className="admin-form-input"
                                    value={itemId}
                                    onChange={(e) => {
                                        setItemId(e.target.value);
                                        setOptLabel('');
                                    }}
                                    disabled={!sub}
                                    style={{ flex: 1, minWidth: 180 }}
                                >
                                    <option value="">Service…</option>
                                    {items.map((it) => (
                                        <option key={it.id} value={it.id}>
                                            {it.name}
                                            {it.price != null ? ` — $${Number(it.price).toFixed(0)}` : ''}
                                        </option>
                                    ))}
                                </select>
                                {opts.length > 0 && (
                                    <select
                                        className="admin-form-input"
                                        value={optLabel}
                                        onChange={(e) => setOptLabel(e.target.value)}
                                        style={{ width: 140 }}
                                    >
                                        <option value="">Option…</option>
                                        {opts.map((o) => (
                                            <option key={o.label} value={o.label}>
                                                {o.label}
                                                {o.price != null ? ` — $${Number(o.price).toFixed(0)}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                )}
                                <button
                                    type="button"
                                    className="admin-action-btn"
                                    onClick={addFromCatalog}
                                    disabled={!item}
                                >
                                    + ADD
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

/** Small helper to keep uncontrolled hidden inputs in sync for form posts. */
export function useServicesJson(lines: ServiceLine[]): string {
    const [json, setJson] = useState('[]');
    useEffect(() => {
        setJson(JSON.stringify(lines));
    }, [lines]);
    return json;
}
