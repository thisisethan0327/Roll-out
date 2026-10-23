'use client';
/**
 * Detail-page CUSTOMER panel with edit capability: shows the linked customer,
 * and (for managers) a toggle to search/link a different existing customer or
 * create a new one inline → relinkTicketCustomer.
 */
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { shopStyles as sh } from '@/components/glide-shop/parts';
import { useRouter } from 'next/navigation';
import { CustomerPicker, type CustomerValue } from '../CustomerPicker';
import { relinkTicketCustomer } from '../form-actions';

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

export function TicketCustomerEditor({
    slug,
    ticketRowId,
    callerRole,
    current,
}: {
    slug: string;
    ticketRowId: string;
    callerRole: string;
    current: { customerId: string | null; name: string | null; email: string | null; phone: string | null };
}) {
    const router = useRouter();
    const [editing, setEditing] = useState(false);
    const [pending, start] = useTransition();
    const [value, setValue] = useState<CustomerValue>({
        customerId: current.customerId,
        name: current.name ?? '',
        email: current.email ?? '',
        phone: current.phone ?? '',
        company: '',
    });
    const canManage = MANAGER_ROLES.has(callerRole);

    const save = () => {
        start(async () => {
            try {
                await relinkTicketCustomer(
                    slug,
                    ticketRowId,
                    value.customerId,
                    value.customerId
                        ? undefined
                        : { name: value.name, email: value.email, phone: value.phone, company: value.company },
                );
                setEditing(false);
                router.refresh();
            } catch (e: any) {
                alert('Link customer failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    if (!editing) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <KV label="Name" value={current.name ?? '—'} />
                <KV label="Email" value={current.email ?? '—'} mono />
                <KV label="Phone" value={current.phone ?? '—'} mono />
                {current.customerId && (
                    <KV
                        label="Customer ID"
                        value={
                            <Link
                                href={`/shop/${slug}/customers/l-${current.customerId}`}
                                className="g-link"
                            >
                                {current.customerId}
                            </Link>
                        }
                    />
                )}
                {canManage && (
                    <div>
                        <button type="button" className="admin-action-btn muted" onClick={() => setEditing(true)}>
                            Change customer
                        </button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <CustomerPicker slug={slug} value={value} onChange={setValue} disabled={pending} />
            <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="admin-action-btn" disabled={pending} onClick={save}>
                    {pending ? 'Saving…' : 'Save customer'}
                </button>
                <button
                    type="button"
                    className="admin-action-btn muted"
                    disabled={pending}
                    onClick={() => setEditing(false)}
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}

function KV({ label, value }: { label: string; value: React.ReactNode; mono?: boolean }) {
    return (
        <div className={sh.kvRow}>
            <span>{label}</span>
            <span>{value}</span>
        </div>
    );
}
