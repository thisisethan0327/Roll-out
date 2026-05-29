'use client';
import { useState, useTransition } from 'react';
import { updateService, toggleServiceActive, deleteService } from './actions';

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

    if (editing) {
        return (
            <tr>
                <td colSpan={6} style={{ padding: 12 }}>
                    <form action={onSubmit} className="admin-form" style={{ marginTop: 0 }}>
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                                gap: 10,
                            }}
                        >
                            <div>
                                <div className="admin-form-label">NAME *</div>
                                <input
                                    name="name"
                                    defaultValue={service.name}
                                    required
                                    className="admin-form-input"
                                />
                            </div>
                            <div>
                                <div className="admin-form-label">CATEGORY</div>
                                <input
                                    name="category"
                                    defaultValue={service.category}
                                    className="admin-form-input"
                                />
                            </div>
                            <div>
                                <div className="admin-form-label">SUBCATEGORY</div>
                                <input
                                    name="subcategory"
                                    defaultValue={service.subcategory ?? ''}
                                    className="admin-form-input"
                                />
                            </div>
                            <div>
                                <div className="admin-form-label">BASE PRICE ($)</div>
                                <input
                                    type="number"
                                    step="0.01"
                                    name="base_price"
                                    defaultValue={service.base_price ?? ''}
                                    className="admin-form-input"
                                />
                            </div>
                            <div>
                                <div className="admin-form-label">DURATION (HOURS)</div>
                                <input
                                    type="number"
                                    step="0.5"
                                    name="duration_hours"
                                    defaultValue={service.duration_hours ?? ''}
                                    className="admin-form-input"
                                />
                            </div>
                            <div>
                                <div className="admin-form-label">SORT ORDER</div>
                                <input
                                    type="number"
                                    name="sort_order"
                                    defaultValue={service.sort_order}
                                    className="admin-form-input"
                                />
                            </div>
                        </div>

                        <div style={{ marginTop: 10 }}>
                            <div className="admin-form-label">DESCRIPTION</div>
                            <textarea
                                name="description"
                                defaultValue={service.description ?? ''}
                                rows={2}
                                className="admin-form-input"
                                style={{ width: '100%' }}
                            />
                        </div>

                        <div style={{ marginTop: 10 }}>
                            <div className="admin-form-label">INTERNAL NOTES</div>
                            <textarea
                                name="notes"
                                defaultValue={service.notes ?? ''}
                                rows={2}
                                className="admin-form-input"
                                style={{ width: '100%' }}
                            />
                        </div>

                        <label
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                marginTop: 10,
                                fontFamily: 'var(--font-display)',
                                fontSize: 11,
                                letterSpacing: 'var(--track-wide)',
                                color: 'var(--text-2)',
                            }}
                        >
                            <input
                                type="checkbox"
                                name="active"
                                defaultChecked={service.active}
                            />
                            ACTIVE
                        </label>

                        <div
                            style={{
                                display: 'flex',
                                gap: 6,
                                justifyContent: 'flex-end',
                                marginTop: 12,
                                flexWrap: 'wrap',
                            }}
                        >
                            <button
                                type="button"
                                className="admin-action-btn muted"
                                disabled={pending}
                                onClick={() => setEditing(false)}
                            >
                                CANCEL
                            </button>
                            {canDelete ? (
                                <button
                                    type="button"
                                    className="admin-action-btn danger"
                                    disabled={pending}
                                    onClick={onDelete}
                                >
                                    {armedDelete ? 'CONFIRM DELETE?' : 'DELETE'}
                                </button>
                            ) : null}
                            <button
                                type="submit"
                                className="admin-action-btn"
                                disabled={pending}
                            >
                                {pending ? 'SAVING…' : 'SAVE ›'}
                            </button>
                        </div>
                    </form>
                </td>
            </tr>
        );
    }

    return (
        <tr>
            <td>
                {service.name}
                {service.subcategory ? (
                    <div className="admin-handle">{service.subcategory}</div>
                ) : null}
            </td>
            <td>{truncate(service.description, 80)}</td>
            <td>{formatPrice(service.base_price)}</td>
            <td>{formatDuration(service.duration_hours)}</td>
            <td>
                {service.active ? (
                    <span className="admin-pill neon">ACTIVE</span>
                ) : (
                    <span className="admin-pill warn">ARCHIVED</span>
                )}
            </td>
            <td style={{ textAlign: 'right' }}>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <button
                        className="admin-action-btn"
                        disabled={pending}
                        onClick={() => setEditing(true)}
                    >
                        EDIT
                    </button>
                    <button
                        className={`admin-action-btn ${service.active ? 'muted' : ''}`}
                        disabled={pending}
                        onClick={onToggle}
                    >
                        {service.active ? 'ARCHIVE' : 'UNARCHIVE'}
                    </button>
                </div>
            </td>
        </tr>
    );
}
