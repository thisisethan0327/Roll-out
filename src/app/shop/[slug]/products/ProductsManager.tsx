'use client';
/** Inventory products list with inline create/edit for non-Medusa shops. Glide: G3 table, labelled fields. */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createProduct, updateProduct, toggleProductActive } from './actions';
import { Check, CircleCheck, CirclePause, Package, Pencil, Plus } from 'lucide-react';
import { GlideButton } from '@/components/glide/primitives';
import { CardHead, Field } from '@/components/glide-console/parts';
import cs from '@/components/glide-console/console.module.css';
import { CardEmpty, cx } from '@/components/glide-shopbiz/parts';
import bz from '@/components/glide-shopbiz/biz.module.css';

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

/** The product fields. Same names as before, so the FormData the actions read is unchanged. */
function Fields({ p, idp }: { p?: Product; idp: string }) {
    const inp = cx(cs.input, bz.in);
    return (
        <div className={cs.form}>
            <div className={cs.grid3f}>
                <Field label="Name" htmlFor={`${idp}-name`}>
                    <input id={`${idp}-name`} name="name" defaultValue={p?.name ?? ''} placeholder="Gloss PPF 60 in" className={inp} />
                </Field>
                <Field label="Brand" htmlFor={`${idp}-brand`}>
                    <input id={`${idp}-brand`} name="brand" defaultValue={p?.brand ?? ''} className={inp} />
                </Field>
                <Field label="SKU" htmlFor={`${idp}-sku`}>
                    <input id={`${idp}-sku`} name="model_sku" defaultValue={p?.model_sku ?? ''} className={inp} />
                </Field>
            </div>
            <div className={bz.editGrid}>
                <Field label="Type" htmlFor={`${idp}-type`}>
                    <select id={`${idp}-type`} name="item_type" defaultValue={p?.item_type ?? 'other'} className={inp}>
                        {ITEM_TYPES.map((t) => (
                            <option key={t} value={t}>
                                {t === 'ppf' ? 'PPF' : t.charAt(0).toUpperCase() + t.slice(1)}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label="Price" htmlFor={`${idp}-price`}>
                    <div className={cs.affix}>
                        <span aria-hidden="true">$</span>
                        <input id={`${idp}-price`} name="price" defaultValue={p?.price ?? ''} type="number" step="0.01" className={inp} />
                    </div>
                </Field>
                <Field label="Cost" htmlFor={`${idp}-cost`}>
                    <div className={cs.affix}>
                        <span aria-hidden="true">$</span>
                        <input id={`${idp}-cost`} name="cost_per_unit" defaultValue={p?.cost_per_unit ?? ''} type="number" step="0.01" className={inp} />
                    </div>
                </Field>
                <Field label="Unit" htmlFor={`${idp}-unit`}>
                    <input id={`${idp}-unit`} name="default_unit" defaultValue={p?.default_unit ?? 'roll'} className={inp} />
                </Field>
                <Field label="Reorder point" htmlFor={`${idp}-low`}>
                    <input id={`${idp}-low`} name="low_stock_threshold" defaultValue={p?.low_stock_threshold ?? 1} type="number" className={inp} />
                </Field>
                <Field label="Track by" htmlFor={`${idp}-track`}>
                    <select id={`${idp}-track`} name="track_by" defaultValue={p?.track_by ?? 'serial'} className={inp}>
                        <option value="serial">Serial</option>
                        <option value="quantity">Quantity</option>
                    </select>
                </Field>
            </div>
            <Field label="Notes" htmlFor={`${idp}-notes`}>
                <input id={`${idp}-notes`} name="notes" defaultValue={p?.notes ?? ''} className={inp} />
            </Field>
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

    const ic = { size: 16, strokeWidth: 2, 'aria-hidden': true } as const;
    const money = (n: number | null) => (n != null ? `$${Number(n).toFixed(2)}` : '—');

    return (
        <>
            {canManage && (
                showAdd ? (
                    <section className="g-card g-edge" aria-labelledby="pm-add-h">
                        <CardHead id="pm-add-h" title="New product" sub="Adds a line to this shop’s inventory." />
                        <form
                            className={cs.cardBody}
                            style={{ paddingBottom: 32 }}
                            onSubmit={(e) => {
                                e.preventDefault();
                                submitCreate(e.currentTarget);
                            }}
                        >
                            <Fields idp="pm-new" />
                            <div className={cx(cs.actRow)} style={{ marginTop: 18 }}>
                                <GlideButton type="submit" size="sm" disabled={pending} aria-busy={pending} icon={<Plus size={18} strokeWidth={2} />}>
                                    {pending ? 'Adding…' : 'Add product'}
                                </GlideButton>
                                <button type="button" className={cx(bz.act, bz.actInk)} onClick={() => setShowAdd(false)}>
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </section>
                ) : (
                    <div className={bz.bar}>
                        <p className={cs.small}>
                            {products.length} product{products.length === 1 ? '' : 's'} in inventory
                        </p>
                        <GlideButton size="sm" onClick={() => setShowAdd(true)} icon={<Plus size={18} strokeWidth={2} />}>
                            New product
                        </GlideButton>
                    </div>
                )
            )}

            <section className="g-card" aria-label="Inventory">
                {products.length === 0 ? (
                    <CardEmpty
                        icon={<Package size={22} strokeWidth={1.75} />}
                        title="No products yet"
                        body={canManage ? 'Add the film, vinyl and parts you stock to track price, cost and reorder points.' : 'Products this shop stocks show up here.'}
                    />
                ) : (
                    <div className={cs.tblWrap}>
                        <table className={cs.tbl}>
                            <thead>
                                <tr>
                                    <th scope="col">Product</th>
                                    <th scope="col">Type</th>
                                    <th scope="col" style={{ textAlign: 'right' }}>
                                        Price
                                    </th>
                                    <th scope="col" style={{ textAlign: 'right' }} className={cs.mHide}>
                                        Cost
                                    </th>
                                    <th scope="col" className={cs.mHide}>
                                        Unit
                                    </th>
                                    <th scope="col">Status</th>
                                    {canManage && (
                                        <th scope="col">
                                            <span className="g-sr">Actions</span>
                                        </th>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {products.map((p) =>
                                    editId === p.id ? (
                                        <tr key={p.id} className={bz.editRow}>
                                            <td colSpan={7}>
                                                <form
                                                    className={bz.editPanel}
                                                    aria-label={`Edit ${p.name ?? 'product'}`}
                                                    onSubmit={(e) => {
                                                        e.preventDefault();
                                                        submitEdit(e.currentTarget, p.id);
                                                    }}
                                                >
                                                    <Fields p={p} idp={`pm-${p.id}`} />
                                                    <div className={cs.actRow} style={{ marginTop: 16 }}>
                                                        <GlideButton type="submit" size="sm" disabled={pending} aria-busy={pending} icon={<Check size={18} strokeWidth={2} />}>
                                                            Save
                                                        </GlideButton>
                                                        <button type="button" className={cx(bz.act, bz.actInk)} onClick={() => setEditId(null)}>
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </form>
                                            </td>
                                        </tr>
                                    ) : (
                                        <tr key={p.id}>
                                            <td>
                                                <b style={{ fontWeight: 600 }}>{p.name ?? '—'}</b>
                                                {(p.brand || p.model_sku) && <small>{[p.brand, p.model_sku].filter(Boolean).join(' · ')}</small>}
                                            </td>
                                            <td>
                                                <span className="g-chip">{p.item_type === 'ppf' ? 'PPF' : (p.item_type ?? '—').charAt(0).toUpperCase() + (p.item_type ?? '').slice(1)}</span>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <span className={cs.num}>{money(p.price)}</span>
                                            </td>
                                            <td style={{ textAlign: 'right' }} className={cs.mHide}>
                                                <span className={cs.num}>{money(p.cost_per_unit)}</span>
                                            </td>
                                            <td className={cs.mHide}>{p.default_unit ?? '—'}</td>
                                            <td>
                                                {p.is_active ? (
                                                    <span className="g-chip g-chip--tint">
                                                        <CircleCheck size={14} strokeWidth={2} aria-hidden="true" />
                                                        Active
                                                    </span>
                                                ) : (
                                                    <span className="g-chip" style={{ color: 'var(--ink-2)' }}>
                                                        <CirclePause size={14} strokeWidth={2} aria-hidden="true" />
                                                        Inactive
                                                    </span>
                                                )}
                                            </td>
                                            {canManage && (
                                                <td className={bz.tdActs}>
                                                    <div className={cx(bz.acts, bz.actsEnd)}>
                                                        <button type="button" className={bz.act} onClick={() => setEditId(p.id)} disabled={pending}>
                                                            <Pencil {...ic} />
                                                            Edit
                                                        </button>
                                                        <button type="button" className={cx(bz.act, bz.actInk)} onClick={() => toggle(p.id)} disabled={pending}>
                                                            {p.is_active ? 'Disable' : 'Enable'}
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    ),
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </>
    );
}
