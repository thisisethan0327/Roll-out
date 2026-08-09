'use client';
/**
 * Materials used on a ticket (public.ticket_materials → serial_numbers →
 * products). View existing, add by picking a shop-scoped product then one of
 * its in-stock serial units, remove existing. Add prefers the emwraps
 * add_material_to_ticket RPC server-side for correct stock accounting.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addTicketMaterial, removeTicketMaterial } from './detail-actions';

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

type MaterialRow = {
    id: string;
    quantity_used: number | null;
    unit: string | null;
    applied_area: string | null;
    notes: string | null;
    product_name: string | null;
    serial_number: string | null;
};

type ProductOption = {
    id: string;
    name: string | null;
    default_unit: string | null;
    serials: { id: string; serial_number: string | null; status: string | null }[];
};

export function TicketMaterials({
    slug,
    ticketRowId,
    materials,
    products,
    callerRole,
}: {
    slug: string;
    ticketRowId: string;
    materials: MaterialRow[];
    products: ProductOption[];
    callerRole: string;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [productId, setProductId] = useState('');
    const [serialId, setSerialId] = useState('');
    const [qty, setQty] = useState('1');
    const [unit, setUnit] = useState('');
    const [area, setArea] = useState('');
    const [armedDelete, setArmedDelete] = useState<string | null>(null);
    const canManage = MANAGER_ROLES.has(callerRole);

    const selectedProduct = products.find((p) => p.id === productId);

    const add = () => {
        if (!serialId) {
            alert('Pick a serial/stock unit first.');
            return;
        }
        start(async () => {
            try {
                await addTicketMaterial(slug, ticketRowId, serialId, {
                    quantity_used: Number(qty) || 1,
                    unit: unit || selectedProduct?.default_unit || 'sqft',
                    applied_area: area,
                });
                setProductId('');
                setSerialId('');
                setQty('1');
                setUnit('');
                setArea('');
                router.refresh();
            } catch (e: any) {
                alert('Add material failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    const remove = (id: string) => {
        if (armedDelete !== id) {
            setArmedDelete(id);
            setTimeout(() => setArmedDelete(null), 3000);
            return;
        }
        setArmedDelete(null);
        start(async () => {
            try {
                await removeTicketMaterial(slug, ticketRowId, id);
                router.refresh();
            } catch (e: any) {
                alert('Remove failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    return (
        <div>
            {materials.length === 0 ? (
                <div className="admin-empty">NO MATERIALS RECORDED</div>
            ) : (
                <div className="admin-table-wrap">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>MATERIAL</th>
                                <th>SERIAL</th>
                                <th>QTY</th>
                                <th>AREA</th>
                                {canManage && <th></th>}
                            </tr>
                        </thead>
                        <tbody>
                            {materials.map((m) => (
                                <tr key={m.id}>
                                    <td>{m.product_name ?? '—'}</td>
                                    <td>
                                        <span className="admin-handle">
                                            {m.serial_number ?? '—'}
                                        </span>
                                    </td>
                                    <td>
                                        {m.quantity_used ?? '—'} {m.unit ?? ''}
                                    </td>
                                    <td>{m.applied_area ?? '—'}</td>
                                    {canManage && (
                                        <td style={{ textAlign: 'right' }}>
                                            <button
                                                type="button"
                                                className="admin-action-btn danger"
                                                disabled={pending}
                                                onClick={() => remove(m.id)}
                                            >
                                                {armedDelete === m.id ? 'SURE?' : '✕'}
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {canManage && (
                <div
                    style={{
                        marginTop: 12,
                        border: '1px solid var(--line)',
                        background: 'var(--bg-2)',
                        padding: 12,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                    }}
                >
                    {products.length === 0 ? (
                        <div className="admin-empty">
                            NO SHOP PRODUCTS WITH STOCK — ADD PRODUCTS IN THE PRODUCTS SECTION.
                        </div>
                    ) : (
                        <>
                            <select
                                className="admin-form-input"
                                value={productId}
                                onChange={(e) => {
                                    setProductId(e.target.value);
                                    setSerialId('');
                                }}
                            >
                                <option value="">Select product…</option>
                                {products.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name ?? p.id}
                                    </option>
                                ))}
                            </select>
                            {selectedProduct && (
                                <select
                                    className="admin-form-input"
                                    value={serialId}
                                    onChange={(e) => setSerialId(e.target.value)}
                                >
                                    <option value="">Select stock unit…</option>
                                    {selectedProduct.serials.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.serial_number ?? s.id.slice(0, 8)}
                                            {s.status ? ` · ${s.status}` : ''}
                                        </option>
                                    ))}
                                </select>
                            )}
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input
                                    className="admin-form-input"
                                    type="number"
                                    step="0.01"
                                    placeholder="Qty"
                                    value={qty}
                                    onChange={(e) => setQty(e.target.value)}
                                    style={{ width: 80 }}
                                />
                                <input
                                    className="admin-form-input"
                                    placeholder={selectedProduct?.default_unit ?? 'unit'}
                                    value={unit}
                                    onChange={(e) => setUnit(e.target.value)}
                                    style={{ width: 90 }}
                                />
                                <input
                                    className="admin-form-input"
                                    placeholder="Applied area"
                                    value={area}
                                    onChange={(e) => setArea(e.target.value)}
                                    style={{ flex: 1 }}
                                />
                            </div>
                            <div>
                                <button
                                    type="button"
                                    className="admin-action-btn"
                                    disabled={pending || !serialId}
                                    onClick={add}
                                >
                                    {pending ? 'ADDING…' : '+ ADD MATERIAL'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
