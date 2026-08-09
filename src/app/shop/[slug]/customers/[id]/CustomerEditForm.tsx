'use client';
/** Collapsible edit form for a legacy customer's contact fields. */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateCustomer } from '../actions';

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

type Customer = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    name: string | null;
    email: string | null;
    phone: string | null;
    company: string | null;
    notes: string | null;
};

export function CustomerEditForm({
    slug,
    customer,
    callerRole,
}: {
    slug: string;
    customer: Customer;
    callerRole: string;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [open, setOpen] = useState(false);
    if (!MANAGER_ROLES.has(callerRole)) return null;

    const submit = (form: HTMLFormElement) => {
        const fd = new FormData(form);
        start(async () => {
            try {
                await updateCustomer(slug, customer.id, fd);
                setOpen(false);
                router.refresh();
            } catch (e: any) {
                alert('Save failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    if (!open) {
        return (
            <button type="button" className="admin-action-btn muted" onClick={() => setOpen(true)} style={{ marginTop: 8 }}>
                EDIT CONTACT
            </button>
        );
    }

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                submit(e.currentTarget);
            }}
            style={{
                border: '1px solid var(--line)',
                background: 'var(--bg-2)',
                padding: 12,
                marginTop: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
            }}
        >
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input name="first_name" defaultValue={customer.first_name ?? ''} placeholder="First name" className="admin-form-input" style={{ flex: 1, minWidth: 120 }} />
                <input name="last_name" defaultValue={customer.last_name ?? ''} placeholder="Last name" className="admin-form-input" style={{ flex: 1, minWidth: 120 }} />
            </div>
            <input name="name" defaultValue={customer.name ?? ''} placeholder="Display name (optional)" className="admin-form-input" />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input name="email" defaultValue={customer.email ?? ''} placeholder="Email" className="admin-form-input" style={{ flex: 1, minWidth: 160 }} />
                <input name="phone" defaultValue={customer.phone ?? ''} placeholder="Phone" className="admin-form-input" style={{ width: 150 }} />
            </div>
            <input name="company" defaultValue={customer.company ?? ''} placeholder="Company" className="admin-form-input" />
            <textarea name="notes" defaultValue={customer.notes ?? ''} placeholder="Notes" rows={2} className="admin-form-input" style={{ resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="admin-action-btn" disabled={pending}>
                    {pending ? 'SAVING…' : 'SAVE CONTACT'}
                </button>
                <button type="button" className="admin-action-btn muted" onClick={() => setOpen(false)}>
                    CANCEL
                </button>
            </div>
        </form>
    );
}
