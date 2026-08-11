'use client';
/**
 * Shared customer selector for new + edit ticket flows.
 *
 * Modes: search existing (shop-scoped, debounced) → select a chip, OR create a
 * new customer inline. Reports the selection up via onChange as:
 *   { customerId: string|null, name, email, phone, company }
 * (customerId null == a new-customer draft to be created on submit.)
 */
import { useEffect, useRef, useState, useTransition } from 'react';
import { searchCustomers, type CustomerHit } from './form-actions';

export type CustomerValue = {
    customerId: string | null;
    name: string;
    email: string;
    phone: string;
    company: string;
};

export const EMPTY_CUSTOMER: CustomerValue = {
    customerId: null,
    name: '',
    email: '',
    phone: '',
    company: '',
};

export function CustomerPicker({
    slug,
    value,
    onChange,
    disabled,
}: {
    slug: string;
    value: CustomerValue;
    onChange: (v: CustomerValue) => void;
    disabled?: boolean;
}) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<CustomerHit[]>([]);
    const [open, setOpen] = useState(false);
    const [searching, startSearch] = useTransition();
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Debounced shop-scoped search.
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const q = query.trim();
        if (q.length < 2) {
            setResults([]);
            return;
        }
        debounceRef.current = setTimeout(() => {
            startSearch(async () => {
                try {
                    setResults(await searchCustomers(slug, q));
                    setOpen(true);
                } catch {
                    setResults([]);
                }
            });
        }, 280);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [query, slug]);

    const select = (c: CustomerHit) => {
        onChange({
            customerId: c.id,
            name: c.name ?? '',
            email: c.email ?? '',
            phone: c.phone ?? '',
            company: c.company ?? '',
        });
        setOpen(false);
        setQuery('');
        setResults([]);
    };

    const clear = () => {
        onChange({ ...EMPTY_CUSTOMER });
        setQuery('');
    };

    // Selected existing customer → chip.
    if (value.customerId) {
        return (
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    border: '1px solid var(--line)',
                    background: 'var(--bg-2)',
                    padding: '8px 12px',
                }}
            >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 600 }}>{value.name || '(unnamed)'}</span>
                    <span className="admin-handle" style={{ fontSize: 11 }}>
                        {[value.email, value.phone].filter(Boolean).join(' · ') || 'LINKED CUSTOMER'}
                    </span>
                </div>
                <button type="button" className="admin-action-btn muted" onClick={clear} disabled={disabled}>
                    CHANGE
                </button>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ position: 'relative' }}>
                <input
                    className="admin-form-input"
                    placeholder="Search customers by name, email, phone…"
                    value={query}
                    disabled={disabled}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => results.length > 0 && setOpen(true)}
                    style={{ width: '100%' }}
                />
                {open && (results.length > 0 || searching) && (
                    <div
                        style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            zIndex: 20,
                            background: 'var(--bg-1)',
                            border: '1px solid var(--line)',
                            maxHeight: 240,
                            overflowY: 'auto',
                        }}
                    >
                        {searching && results.length === 0 ? (
                            <div className="admin-empty" style={{ padding: 10 }}>
                                SEARCHING…
                            </div>
                        ) : (
                            results.map((c) => (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => select(c)}
                                    style={{
                                        display: 'block',
                                        width: '100%',
                                        textAlign: 'left',
                                        padding: '8px 12px',
                                        background: 'transparent',
                                        border: 'none',
                                        borderBottom: '1px solid var(--line)',
                                        cursor: 'pointer',
                                        color: 'var(--text)',
                                    }}
                                >
                                    <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name || '(unnamed)'}</div>
                                    <div className="admin-handle" style={{ fontSize: 11 }}>
                                        {[c.email, c.phone, c.company].filter(Boolean).join(' · ')}
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* Inline new-customer fields (used when nothing is selected). */}
            <div style={{ fontSize: 10, letterSpacing: 1, color: 'var(--text-3)' }}>
                OR ENTER A NEW CUSTOMER
            </div>
            <input
                className="admin-form-input"
                placeholder="Customer name"
                value={value.name}
                disabled={disabled}
                onChange={(e) => onChange({ ...value, name: e.target.value })}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input
                    className="admin-form-input"
                    type="email"
                    placeholder="Email"
                    value={value.email}
                    disabled={disabled}
                    onChange={(e) => onChange({ ...value, email: e.target.value })}
                />
                <input
                    className="admin-form-input"
                    placeholder="Phone"
                    value={value.phone}
                    disabled={disabled}
                    onChange={(e) => onChange({ ...value, phone: e.target.value })}
                />
            </div>
            <input
                className="admin-form-input"
                placeholder="Company (optional)"
                value={value.company}
                disabled={disabled}
                onChange={(e) => onChange({ ...value, company: e.target.value })}
            />
        </div>
    );
}
