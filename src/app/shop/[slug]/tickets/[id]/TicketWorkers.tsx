'use client';
/**
 * Worker assignment — pick shop staff to assign to this ticket. Uses the
 * delete-all-then-insert pattern server-side. The pool is public.profiles rows
 * bridged from the shop's rollout members (see staff-bridge.ts); may be empty
 * for shops without email-matched legacy staff.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setTicketWorkers } from './detail-actions';

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

type PoolEntry = { profileId: string; name: string; role: string | null };

export function TicketWorkers({
    slug,
    ticketRowId,
    pool,
    assignedIds,
    callerRole,
}: {
    slug: string;
    ticketRowId: string;
    pool: PoolEntry[];
    assignedIds: string[];
    callerRole: string;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [selected, setSelected] = useState<Set<string>>(new Set(assignedIds));
    const [dirty, setDirty] = useState(false);
    const canManage = MANAGER_ROLES.has(callerRole);

    const toggle = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
        setDirty(true);
    };

    const save = () => {
        start(async () => {
            try {
                await setTicketWorkers(slug, ticketRowId, Array.from(selected));
                setDirty(false);
                router.refresh();
            } catch (e: any) {
                alert('Save assignment failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    if (pool.length === 0) {
        return (
            <div className="admin-empty">
                NO ASSIGNABLE STAFF — LINK SHOP MEMBERS TO STAFF RECORDS TO ENABLE
                ASSIGNMENT.
            </div>
        );
    }

    if (!canManage) {
        const names = pool.filter((p) => selected.has(p.profileId)).map((p) => p.name);
        return names.length ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {names.map((n) => (
                    <span key={n} className="admin-pill">
                        {n}
                    </span>
                ))}
            </div>
        ) : (
            <div className="admin-empty">NO INSTALLERS ASSIGNED</div>
        );
    }

    return (
        <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pool.map((p) => {
                    const on = selected.has(p.profileId);
                    return (
                        <label
                            key={p.profileId}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                fontSize: 12,
                                cursor: 'pointer',
                                color: 'var(--text)',
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={on}
                                onChange={() => toggle(p.profileId)}
                                disabled={pending}
                            />
                            <span>{p.name}</span>
                            {p.role && <span className="admin-handle">{p.role}</span>}
                        </label>
                    );
                })}
            </div>
            {dirty && (
                <div style={{ marginTop: 10 }}>
                    <button
                        type="button"
                        className="admin-action-btn"
                        disabled={pending}
                        onClick={save}
                    >
                        {pending ? 'SAVING…' : 'SAVE ASSIGNMENT'}
                    </button>
                </div>
            )}
        </div>
    );
}
