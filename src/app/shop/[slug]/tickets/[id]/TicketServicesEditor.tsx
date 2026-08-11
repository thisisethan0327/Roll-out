'use client';
/**
 * Detail-page services editor: the shared ServiceLinesEditor plus a Save button.
 * Reads existing services across every historical emwraps shape via the shared
 * parser and writes back in the canonical emwraps-compatible shape (server
 * recomputes total_price).
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateTicketServices } from './detail-actions';
import { ServiceLinesEditor } from '../ServiceLinesEditor';
import { parseServices, type ServiceLine } from '@/lib/ticket-services';

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

export function TicketServicesEditor({
    slug,
    ticketRowId,
    initial,
    callerRole,
}: {
    slug: string;
    ticketRowId: string;
    initial: any;
    callerRole: string;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [lines, setLines] = useState<ServiceLine[]>(() => parseServices(initial));
    const [dirty, setDirty] = useState(false);
    const canManage = MANAGER_ROLES.has(callerRole);

    const setAndDirty = (next: ServiceLine[]) => {
        setLines(next);
        setDirty(true);
    };

    const save = () => {
        start(async () => {
            try {
                await updateTicketServices(slug, ticketRowId, lines);
                setDirty(false);
                router.refresh();
            } catch (e: any) {
                alert('Save services failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    if (!canManage) {
        return lines.length === 0 ? (
            <div className="admin-empty">NO SERVICES LISTED</div>
        ) : (
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.65 }}>
                {lines.map((l, i) => {
                    const total =
                        l.unitPrice != null ? l.unitPrice * (l.quantity || 1) : null;
                    return (
                        <li key={i} style={{ fontFamily: 'var(--font-body)' }}>
                            {l.service}
                            {l.quantity > 1 ? ` × ${l.quantity}` : ''}
                            {total != null ? ` — $${total.toFixed(2)}` : ''}
                        </li>
                    );
                })}
            </ul>
        );
    }

    return (
        <div>
            <ServiceLinesEditor slug={slug} lines={lines} onChange={setAndDirty} disabled={pending} />
            {dirty && (
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        type="button"
                        className="admin-action-btn"
                        disabled={pending}
                        onClick={save}
                    >
                        {pending ? 'SAVING…' : 'SAVE SERVICES'}
                    </button>
                </div>
            )}
        </div>
    );
}
