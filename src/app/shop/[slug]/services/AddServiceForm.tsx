'use client';
import { useState, useTransition } from 'react';
import { addService } from './actions';

export function AddServiceForm({ shopId }: { shopId: number }) {
    const [open, setOpen] = useState(false);
    const [pending, start] = useTransition();

    const onSubmit = (formData: FormData) => {
        start(async () => {
            try {
                await addService(shopId, formData);
                setOpen(false);
            } catch (e: any) {
                alert('Add failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    if (!open) {
        return (
            <button
                className="admin-action-btn"
                onClick={() => setOpen(true)}
            >
                + ADD SERVICE
            </button>
        );
    }

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.6)',
                zIndex: 100,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                padding: 24,
                overflow: 'auto',
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) setOpen(false);
            }}
        >
            <div
                style={{
                    background: 'var(--surface-1, #0c0c14)',
                    border: '1px solid var(--gold, #e8a845)',
                    padding: 20,
                    width: '100%',
                    maxWidth: 720,
                    marginTop: 40,
                }}
            >
                <div
                    style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 14,
                        letterSpacing: 'var(--track-wide)',
                        color: 'var(--gold)',
                        marginBottom: 14,
                    }}
                >
                    ADD NEW SERVICE
                </div>

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
                                required
                                placeholder="e.g. Full Vehicle Wrap"
                                className="admin-form-input"
                            />
                        </div>
                        <div>
                            <div className="admin-form-label">CATEGORY</div>
                            <input
                                name="category"
                                defaultValue="OTHER"
                                placeholder="WRAP | PPF | TINT | CERAMIC | PARTS | OTHER"
                                className="admin-form-input"
                            />
                        </div>
                        <div>
                            <div className="admin-form-label">SUBCATEGORY</div>
                            <input
                                name="subcategory"
                                placeholder="e.g. Color change"
                                className="admin-form-input"
                            />
                        </div>
                        <div>
                            <div className="admin-form-label">BASE PRICE ($)</div>
                            <input
                                type="number"
                                step="0.01"
                                name="base_price"
                                placeholder="leave blank for ASK FOR QUOTE"
                                className="admin-form-input"
                            />
                        </div>
                        <div>
                            <div className="admin-form-label">DURATION (HOURS)</div>
                            <input
                                type="number"
                                step="0.5"
                                name="duration_hours"
                                className="admin-form-input"
                            />
                        </div>
                        <div>
                            <div className="admin-form-label">SORT ORDER</div>
                            <input
                                type="number"
                                name="sort_order"
                                defaultValue="0"
                                className="admin-form-input"
                            />
                        </div>
                    </div>

                    <div style={{ marginTop: 10 }}>
                        <div className="admin-form-label">DESCRIPTION</div>
                        <textarea
                            name="description"
                            rows={2}
                            className="admin-form-input"
                            style={{ width: '100%' }}
                        />
                    </div>

                    <div style={{ marginTop: 10 }}>
                        <div className="admin-form-label">INTERNAL NOTES</div>
                        <textarea
                            name="notes"
                            rows={2}
                            placeholder="Not shown to customer"
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
                            defaultChecked
                        />
                        ACTIVE
                    </label>

                    <div
                        style={{
                            display: 'flex',
                            gap: 6,
                            justifyContent: 'flex-end',
                            marginTop: 14,
                            flexWrap: 'wrap',
                        }}
                    >
                        <button
                            type="button"
                            className="admin-action-btn muted"
                            disabled={pending}
                            onClick={() => setOpen(false)}
                        >
                            CANCEL
                        </button>
                        <button
                            type="submit"
                            className="admin-action-btn"
                            disabled={pending}
                        >
                            {pending ? 'SAVING…' : 'CREATE ›'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
