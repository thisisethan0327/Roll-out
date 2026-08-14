'use client';
/**
 * RSVP mode + tier rows editor for the event composer (E2).
 *
 * Lives inside BOTH the create form (a plain server-action <form>) and the
 * edit form, so it serializes its state into two form fields instead of
 * submitting itself: `rsvp_mode` ('free' | 'tiered') and `tiers_json` (the
 * tier rows as JSON, dollars already converted to cents). The server action
 * (createEvent / updateEvent in ./actions.ts) parses + validates that payload
 * behind the shop guard — this component is purely a structured input.
 *
 * Rows carry their DB id when editing so the server can UPDATE existing tiers
 * (they may already have RSVPs pointing at them) and soft-retire removed ones
 * (active=false) instead of deleting.
 */
import { useState } from 'react';

export type TierDraft = {
    /** DB id when editing an existing tier; absent for new rows. */
    id?: string;
    name: string;
    /** Ticket price in DOLLARS as typed ('' = 0 = free ticket). */
    price: string;
    /** Tier sub-cap ('' = shares the event cap). */
    capacity: string;
    reservedSpot: boolean;
    /** Comma-separated perks ("sticker pack, front row"). */
    includes: string;
    packageMode: 'none' | 'included' | 'addon';
    /** Package price in DOLLARS (addon mode only). */
    packagePrice: string;
    /** Medusa product id backing the paid checkout (optional, plain text). */
    medusaProductId: string;
};

const EMPTY_ROW: TierDraft = {
    name: '',
    price: '',
    capacity: '',
    reservedSpot: false,
    includes: '',
    packageMode: 'none',
    packagePrice: '',
    medusaProductId: '',
};

const PACKAGE_MODES: { value: TierDraft['packageMode']; label: string }[] = [
    { value: 'none', label: 'NONE' },
    { value: 'included', label: 'INCLUDED' },
    { value: 'addon', label: 'ADD-ON' },
];

/** Dollars string → integer cents ('' / junk → 0). */
function toCents(dollars: string): number {
    const n = Number.parseFloat(dollars);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n * 100);
}

/** The wire payload rows the server action parses out of `tiers_json`. */
function serialize(rows: TierDraft[]): string {
    return JSON.stringify(
        rows.map((r, i) => ({
            ...(r.id ? { id: r.id } : {}),
            name: r.name.trim(),
            price_cents: toCents(r.price),
            capacity: r.capacity.trim() === '' ? null : Number.parseInt(r.capacity, 10),
            reserved_spot: r.reservedSpot,
            includes: r.includes
                .split(',')
                .map((s) => s.trim())
                .filter((s) => s.length > 0),
            package_mode: r.packageMode,
            package_price_cents: r.packageMode === 'addon' ? toCents(r.packagePrice) : null,
            medusa_product_id: r.medusaProductId.trim() || null,
            sort: i,
        })),
    );
}

export function TierRowsEditor({
    initialMode,
    initialTiers,
    disabled,
}: {
    initialMode?: 'free' | 'tiered';
    initialTiers?: TierDraft[];
    disabled?: boolean;
}) {
    const [mode, setMode] = useState<'free' | 'tiered'>(initialMode ?? 'free');
    const [rows, setRows] = useState<TierDraft[]>(
        initialTiers && initialTiers.length > 0 ? initialTiers : [{ ...EMPTY_ROW }],
    );

    const setRow = (i: number, patch: Partial<TierDraft>) =>
        setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    const addRow = () => setRows((rs) => [...rs, { ...EMPTY_ROW }]);
    const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

    return (
        <div>
            {/* The structured payload the server action reads. */}
            <input type="hidden" name="rsvp_mode" value={mode} />
            <input type="hidden" name="tiers_json" value={mode === 'tiered' ? serialize(rows) : '[]'} />

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                {(['free', 'tiered'] as const).map((m) => (
                    <label
                        key={m}
                        className="admin-form-label"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            cursor: disabled ? 'not-allowed' : 'pointer',
                        }}
                    >
                        <input
                            type="radio"
                            checked={mode === m}
                            onChange={() => setMode(m)}
                            disabled={disabled}
                        />
                        {m === 'free' ? 'FREE' : 'TIERED'}
                    </label>
                ))}
            </div>

            {mode === 'tiered' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {rows.map((row, i) => (
                        <div
                            key={row.id ?? `new-${i}`}
                            style={{
                                border: '1px solid var(--rule, var(--line))',
                                padding: '12px 14px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 6,
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span
                                    style={{
                                        fontFamily: 'var(--font-display)',
                                        fontSize: 10,
                                        letterSpacing: 'var(--track-wider)',
                                        color: 'var(--text-3, #8a8a9a)',
                                    }}
                                >
                                    TIER {i + 1}
                                    {row.id ? ' · SAVED' : ''}
                                </span>
                                {rows.length > 1 ? (
                                    <button
                                        type="button"
                                        className="admin-action-btn danger"
                                        onClick={() => removeRow(i)}
                                        disabled={disabled}
                                    >
                                        REMOVE
                                    </button>
                                ) : null}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                                <div>
                                    <label className="admin-form-label">NAME *</label>
                                    <input
                                        className="admin-form-input"
                                        value={row.name}
                                        onChange={(e) => setRow(i, { name: e.target.value })}
                                        placeholder="General / VIP / Show Car"
                                        disabled={disabled}
                                    />
                                </div>
                                <div>
                                    <label className="admin-form-label">TICKET $ (0 = FREE)</label>
                                    <input
                                        className="admin-form-input"
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={row.price}
                                        onChange={(e) => setRow(i, { price: e.target.value })}
                                        placeholder="0.00"
                                        disabled={disabled}
                                    />
                                </div>
                                <div>
                                    <label className="admin-form-label">SUB-CAP</label>
                                    <input
                                        className="admin-form-input"
                                        type="number"
                                        min={1}
                                        value={row.capacity}
                                        onChange={(e) => setRow(i, { capacity: e.target.value })}
                                        placeholder="Shared"
                                        disabled={disabled}
                                    />
                                </div>
                            </div>

                            <label className="admin-form-label">INCLUDES (COMMA-SEPARATED)</label>
                            <input
                                className="admin-form-input"
                                value={row.includes}
                                onChange={(e) => setRow(i, { includes: e.target.value })}
                                placeholder="sticker pack, front row parking"
                                disabled={disabled}
                            />

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}>
                                <div>
                                    <label className="admin-form-label">PACKAGE</label>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        {PACKAGE_MODES.map((p) => (
                                            <label
                                                key={p.value}
                                                className="admin-form-label"
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: 6,
                                                    cursor: disabled ? 'not-allowed' : 'pointer',
                                                }}
                                            >
                                                <input
                                                    type="radio"
                                                    checked={row.packageMode === p.value}
                                                    onChange={() => setRow(i, { packageMode: p.value })}
                                                    disabled={disabled}
                                                />
                                                {p.label}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                {row.packageMode === 'addon' ? (
                                    <div>
                                        <label className="admin-form-label">PACKAGE $</label>
                                        <input
                                            className="admin-form-input"
                                            type="number"
                                            min={0}
                                            step="0.01"
                                            value={row.packagePrice}
                                            onChange={(e) => setRow(i, { packagePrice: e.target.value })}
                                            placeholder="25.00"
                                            disabled={disabled}
                                        />
                                    </div>
                                ) : null}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
                                <div>
                                    <label className="admin-form-label">MEDUSA PRODUCT ID (OPTIONAL)</label>
                                    <input
                                        className="admin-form-input"
                                        value={row.medusaProductId}
                                        onChange={(e) => setRow(i, { medusaProductId: e.target.value })}
                                        placeholder="prod_… (required to sell this tier)"
                                        disabled={disabled}
                                    />
                                </div>
                                <label
                                    className="admin-form-label"
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        cursor: disabled ? 'not-allowed' : 'pointer',
                                        paddingBottom: 10,
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={row.reservedSpot}
                                        onChange={(e) => setRow(i, { reservedSpot: e.target.checked })}
                                        disabled={disabled}
                                    />
                                    RESERVED SPOT
                                </label>
                            </div>
                        </div>
                    ))}

                    <button
                        type="button"
                        className="admin-action-btn"
                        onClick={addRow}
                        disabled={disabled}
                        style={{ alignSelf: 'flex-start' }}
                    >
                        + ADD TIER
                    </button>
                </div>
            ) : null}
        </div>
    );
}
