'use client';
/** Inventory products list with inline create/edit for non-Medusa shops. */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createProduct, updateProduct, toggleProductActive } from './actions';

type Product = {
    id: string;
    name: string | null;
    brand: string | null;
    model_sku: string | null;
    item_type: string | null;
    price: number | null;
    cost_per_unit: number | null;
    default_unit: string | null;
    low_stock_threshold: number | null;
    track_by: string | null;
    is_active: boolean | null;
    notes: string | null;
};

const ITEM_TYPES = ['ppf', 'vinyl', 'tint', 'ceramic', 'parts', 'other'];

function Fields({ p }: { p?: Product }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input name="name" defaultValue={p?.name ?? ''} placeholder="Name *" className="admin-form-input" style={{ flex: 1, minWidth: 160 }} />
                <input name="brand" defaultValue={p?.brand ?? ''} placeholder="Brand" className="admin-form-input" style={{ width: 130 }} />
                <input name="model_sku" defaultValue={p?.model_sku ?? ''} placeholder="SKU" className="admin-form-input" style={{ width: 130 }} />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select name="item_type" defaultValue={p?.item_type ?? 'other'} className="admin-form-input" style={{ width: 120 }}>
                    {ITEM_TYPES.map((t) => (
                        <option key={t} value={t}>{t.toUpperCase()}</option>
                    ))}
                </select>
                <input name="price" defaultValue={p?.price ?? ''} placeholder="Price" type="number" step="0.01" className="admin-form-input" style={{ width: 100 }} />
                <input name="cost_per_unit" defaultValue={p?.cost_per_unit ?? ''} placeholder="Cost" type="number" step="0.01" className="admin-form-input" style={{ width: 100 }} />
                <input name="default_unit" defaultValue={p?.default_unit ?? 'roll'} placeholder="Unit" className="admin-form-input" style={{ width: 90 }} />
                <input name="low_stock_threshold" defaultValue={p?.low_stock_threshold ?? 1} placeholder="Reorder pt" type="number" className="admin-form-input" style={{ width: 100 }} />
                <select name="track_by" defaultValue={p?.track_by ?? 'serial'} className="admin-form-input" style={{ width: 120 }}>
                    <option value="serial">TRACK: SERIAL</option>
                    <option value="quantity">TRACK: QTY</option>
                </select>
            </div>
            <input name="notes" defaultValue={p?.notes ?? ''} placeholder="Notes" className="admin-form-input" />
        </div>
    );
}

export function ProductsManager({
    slug,
    products,
    callerRole,
}: {
    slug: string;
    products: Product[];
    callerRole: string;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [showAdd, setShowAdd] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const canManage = new Set(['owner', 'admin', 'manager']).has(callerRole);

    const submitCreate = (form: HTMLFormElement) => {
        const fd = new FormData(form);
        start(async () => {
            try {
                await createProduct(slug, fd);
                form.reset();
                setShowAdd(false);
                router.refresh();
            } catch (e: any) {
                alert('Create failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };
    const submitEdit = (form: HTMLFormElement, id: string) => {
        const fd = new FormData(form);
        start(async () => {
            try {
                await updateProduct(slug, id, fd);
                setEditId(null);
                router.refresh();
            } catch (e: any) {
                alert('Update failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };
    const toggle = (id: string) => {
        start(async () => {
            try {
                await toggleProductActive(slug, id);
                router.refresh();
            } catch (e: any) {
                alert('Toggle failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    return (
        <div>
            {canManage && (
                <div style={{ marginBottom: 12 }}>
                    {showAdd ? (
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                submitCreate(e.currentTarget);
                            }}
                            style={{ border: '1px solid var(--line)', background: 'var(--bg-2)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}
                        >
                            <Fields />
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button type="submit" className="admin-action-btn" disabled={pending}>
                                    {pending ? 'ADDING…' : 'ADD PRODUCT'}
                                </button>
                                <button type="button" className="admin-action-btn muted" onClick={() => setShowAdd(false)}>
                                    CANCEL
                                </button>
                            </div>
                        </form>
                    ) : (
                        <button type="button" className="admin-action-btn" onClick={() => setShowAdd(true)}>
                            + NEW PRODUCT
                        </button>
                    )}
                </div>
            )}

            {products.length === 0 ? (
                <div className="admin-empty">NO PRODUCTS YET</div>
            ) : (
                <div className="admin-table-wrap">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>PRODUCT</th>
                                <th>TYPE</th>
                                <th style={{ textAlign: 'right' }}>PRICE</th>
                                <th style={{ textAlign: 'right' }}>COST</th>
                                <th>UNIT</th>
                                <th>STATUS</th>
                                {canManage && <th></th>}
                            </tr>
                        </thead>
                        <tbody>
                            {products.map((p) =>
                                editId === p.id ? (
                                    <tr key={p.id}>
                                        <td colSpan={7}>
                                            <form
                                                onSubmit={(e) => {
                                                    e.preventDefault();
                                                    submitEdit(e.currentTarget, p.id);
                                                }}
                                                style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '6px 0' }}
                                            >
                                                <Fields p={p} />
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <button type="submit" className="admin-action-btn" disabled={pending}>SAVE</button>
                                                    <button type="button" className="admin-action-btn muted" onClick={() => setEditId(null)}>CANCEL</button>
                                                </div>
                                            </form>
                                        </td>
                                    </tr>
                                ) : (
                                    <tr key={p.id}>
                                        <td>
                                            {p.name ?? '—'}
                                            {(p.brand || p.model_sku) && (
                                                <div className="admin-handle">
                                                    {[p.brand, p.model_sku].filter(Boolean).join(' · ')}
                                                </div>
                                            )}
                                        </td>
                                        <td><span className="admin-pill">{(p.item_type ?? '—').toUpperCase()}</span></td>
                                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>
                                            {p.price != null ? `$${Number(p.price).toFixed(2)}` : '—'}
                                        </td>
                                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}>
                                            {p.cost_per_unit != null ? `$${Number(p.cost_per_unit).toFixed(2)}` : '—'}
                                        </td>
                                        <td>{p.default_unit ?? '—'}</td>
                                        <td>
                                            <span className={`admin-pill ${p.is_active ? 'neon' : 'warn'}`}>
                                                {p.is_active ? 'ACTIVE' : 'INACTIVE'}
                                            </span>
                                        </td>
                                        {canManage && (
                                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                <button type="button" className="admin-action-btn muted" onClick={() => setEditId(p.id)} disabled={pending}>EDIT</button>
                                                <button type="button" className="admin-action-btn muted" onClick={() => toggle(p.id)} disabled={pending} style={{ marginLeft: 6 }}>
                                                    {p.is_active ? 'DISABLE' : 'ENABLE'}
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ),
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
