'use client';
import { useState, useTransition } from 'react';
import { updateService, toggleServiceActive, deleteService } from './actions';
import { Archive, Check, CircleCheck, Pencil, Trash2 } from 'lucide-react';
import { GlideButton } from '@/components/glide/primitives';
import cs from '@/components/glide-console/console.module.css';
import { ServiceFields } from '@/components/glide-shopbiz/ServiceFields';
import { cx } from '@/components/glide-shopbiz/parts';
import bz from '@/components/glide-shopbiz/biz.module.css';

export type ServiceRowData = {
    id: string;
    shop_id: number;
    category: string;
    subcategory: string | null;
    name: string;
    description: string | null;
    base_price: number | null;
    duration_hours: number | null;
    notes: string | null;
    sort_order: number;
    active: boolean;
};

function truncate(s: string | null | undefined, n: number): string {
    if (!s) return '—';
    if (s.length <= n) return s;
    return s.slice(0, n - 1).trimEnd() + '…';
}

function formatPrice(p: number | null | undefined): string {
    if (p == null) return '—';
    const num = typeof p === 'string' ? parseFloat(p) : p;
    if (Number.isNaN(num)) return '—';
    return `$${num.toFixed(2)}`;
}

function formatDuration(h: number | null | undefined): string {
    if (h == null) return '—';
    const num = typeof h === 'string' ? parseFloat(h) : h;
    if (Number.isNaN(num)) return '—';
    return `${num}h`;
}

export function ServiceRow({ service, canDelete }: { service: ServiceRowData; canDelete: boolean }) {
    const [editing, setEditing] = useState(false);
    const [pending, start] = useTransition();
    const [armedDelete, setArmedDelete] = useState(false);

    const onSubmit = (formData: FormData) => {
        start(async () => {
            try {
                await updateService(service.id, service.shop_id, formData);
                setEditing(false);
            } catch (e: any) {
                alert('Update failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    const onToggle = () => {
        start(async () => {
            try {
                await toggleServiceActive(service.id, service.shop_id);
            } catch (e: any) {
                alert('Toggle failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    const onDelete = () => {
        if (!armedDelete) {
            setArmedDelete(true);
            setTimeout(() => setArmedDelete(false), 3000);
            return;
        }
        start(async () => {
            try {
                await deleteService(service.id, service.shop_id);
            } catch (e: any) {
                alert('Delete failed: ' + (e?.message ?? 'unknown'));
                setArmedDelete(false);
            }
        });
    };

    const ic = { size: 16, strokeWidth: 2, 'aria-hidden': true } as const;

    if (editing) {
        return (
            <tr className={bz.editRow}>
                <td colSpan={6}>
                    <form action={onSubmit} className={bz.editPanel} aria-label={`Edit ${service.name}`}>
                        <ServiceFields idp={`svc-${service.id}`} v={service} />
                        <div className={cs.actRow} style={{ marginTop: 16, justifyContent: 'flex-end' }}>
                            <button type="button" className={cx(bz.act, bz.actInk)} disabled={pending} onClick={() => setEditing(false)}>
                                Cancel
                            </button>
                            {canDelete ? (
                                <button
                                    type="button"
                                    className={cx(bz.act, bz.actInk, armedDelete ? bz.actArmed : bz.actDanger)}
                                    disabled={pending}
                                    onClick={onDelete}
                                >
                                    <Trash2 {...ic} />
                                    {armedDelete ? 'Confirm delete?' : 'Delete'}
                                </button>
                            ) : null}
                            <GlideButton type="submit" size="sm" disabled={pending} aria-busy={pending} icon={<Check size={18} strokeWidth={2} />}>
                                {pending ? 'Saving…' : 'Save'}
                            </GlideButton>
                        </div>
                    </form>
                </td>
            </tr>
        );
    }

    return (
        <tr>
            <td>
                <b style={{ fontWeight: 600 }}>{service.name}</b>
                {service.subcategory ? <small>{service.subcategory}</small> : null}
            </td>
            <td className={cs.mHide}>
                <span className={bz.clip} style={{ color: 'var(--ink-2)' }}>
                    {truncate(service.description, 80)}
                </span>
            </td>
            <td style={{ textAlign: 'right' }}>
                <span className={cs.num}>{formatPrice(service.base_price)}</span>
            </td>
            <td className={cs.mHide}>
                <span className={cs.num}>{formatDuration(service.duration_hours)}</span>
            </td>
            <td>
                {service.active ? (
                    <span className="g-chip g-chip--tint">
                        <CircleCheck size={14} strokeWidth={2} aria-hidden="true" />
                        Active
                    </span>
                ) : (
                    <span className="g-chip" style={{ color: 'var(--ink-2)' }}>
                        <Archive size={14} strokeWidth={2} aria-hidden="true" />
                        Archived
                    </span>
                )}
            </td>
            <td className={bz.tdActs}>
                <div className={cx(bz.acts, bz.actsEnd)}>
                    <button type="button" className={bz.act} disabled={pending} onClick={() => setEditing(true)}>
                        <Pencil {...ic} />
                        Edit
                    </button>
                    <button type="button" className={cx(bz.act, bz.actInk)} disabled={pending} onClick={onToggle}>
                        {service.active ? 'Archive' : 'Unarchive'}
                    </button>
                </div>
            </td>
        </tr>
    );
}
