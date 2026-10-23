'use client';
/**
 * Inline mutation controls for a single ticket detail page. Renders the
 * dropdowns + date input + append-note form; each control wraps a server
 * action in useTransition so the UI shows a pending state.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setStatus, setServiceDay, setPriority, appendNote } from '../actions';
import { setTicketSchedule } from '../form-actions';

// Must match the public.tickets `tickets_status_check` DB constraint.
const STATUS_OPTIONS = [
    'quote',
    'estimate',
    'pending',
    'in-progress',
    'completed',
    'declined',
    'cancelled',
];

// Must match the public.tickets `tickets_priority_check` DB constraint
// (priority = ANY('normal','rush')); high/urgent would violate it.
const PRIORITY_OPTIONS = ['normal', 'rush'];

/** 'in-progress' → 'In progress' (the stored value is unchanged). */
function label(v: string): string {
    const t = v.replace(/[_-]/g, ' ');
    return t.charAt(0).toUpperCase() + t.slice(1);
}

export function StatusSelect({
    id,
    slug,
    ticketRowId,
    initial,
}: {
    /** For a visible <label htmlFor>. */
    id?: string;
    slug: string;
    ticketRowId: string;
    initial: string | null;
}) {
    const [pending, start] = useTransition();
    const [value, setValue] = useState(initial ?? 'pending');
    return (
        <select
            id={id}
            disabled={pending}
            value={value}
            onChange={(e) => {
                const next = e.target.value;
                setValue(next);
                start(async () => {
                    try {
                        await setStatus(slug, ticketRowId, next);
                    } catch (err: any) {
                        alert('Status update failed: ' + (err?.message ?? 'unknown'));
                        setValue(initial ?? 'pending');
                    }
                });
            }}
            className="admin-form-input"
            style={{ width: '100%' }}
        >
            {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                    {label(s)}
                </option>
            ))}
        </select>
    );
}

export function PrioritySelect({
    id,
    slug,
    ticketRowId,
    initial,
}: {
    /** For a visible <label htmlFor>. */
    id?: string;
    slug: string;
    ticketRowId: string;
    initial: string | null;
}) {
    const [pending, start] = useTransition();
    const [value, setValue] = useState((initial ?? 'normal').toLowerCase());
    return (
        <select
            id={id}
            disabled={pending}
            value={value}
            onChange={(e) => {
                const next = e.target.value;
                setValue(next);
                start(async () => {
                    try {
                        await setPriority(slug, ticketRowId, next);
                    } catch (err: any) {
                        alert('Priority update failed: ' + (err?.message ?? 'unknown'));
                        setValue((initial ?? 'normal').toLowerCase());
                    }
                });
            }}
            className="admin-form-input"
            style={{ width: '100%' }}
        >
            {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>
                    {label(p)}
                </option>
            ))}
        </select>
    );
}

export function ServiceDayInput({
    slug,
    ticketRowId,
    initial,
}: {
    slug: string;
    ticketRowId: string;
    initial: string | null;
}) {
    const [pending, start] = useTransition();
    const [value, setValue] = useState(initial ?? '');
    return (
        <input
            type="date"
            disabled={pending}
            value={value}
            onChange={(e) => {
                const next = e.target.value;
                setValue(next);
                start(async () => {
                    try {
                        await setServiceDay(slug, ticketRowId, next);
                    } catch (err: any) {
                        alert('Service day update failed: ' + (err?.message ?? 'unknown'));
                        setValue(initial ?? '');
                    }
                });
            }}
            className="admin-form-input"
            style={{ width: '100%' }}
        />
    );
}

export function ScheduleEditor({
    slug,
    ticketRowId,
    initialServiceDay,
    initialEndDate,
}: {
    slug: string;
    ticketRowId: string;
    initialServiceDay: string | null;
    initialEndDate: string | null;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [serviceDay, setServiceDayVal] = useState(initialServiceDay ?? '');
    const [endDate, setEndDate] = useState(initialEndDate ?? '');

    const commit = (sd: string, ed: string) => {
        start(async () => {
            try {
                await setTicketSchedule(slug, ticketRowId, sd || null, ed || null);
                router.refresh();
            } catch (err: any) {
                alert('Reschedule failed: ' + (err?.message ?? 'unknown'));
                setServiceDayVal(initialServiceDay ?? '');
                setEndDate(initialEndDate ?? '');
            }
        });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="admin-form-label">Service day</span>
                <input
                    type="date"
                    disabled={pending}
                    value={serviceDay}
                    onChange={(e) => {
                        setServiceDayVal(e.target.value);
                        commit(e.target.value, endDate);
                    }}
                    className="admin-form-input"
                    style={{ width: '100%' }}
                />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="admin-form-label">End date</span>
                <input
                    type="date"
                    disabled={pending}
                    value={endDate}
                    onChange={(e) => {
                        setEndDate(e.target.value);
                        commit(serviceDay, e.target.value);
                    }}
                    className="admin-form-input"
                    style={{ width: '100%' }}
                />
            </label>
        </div>
    );
}

export function AppendNoteForm({
    slug,
    ticketRowId,
}: {
    slug: string;
    ticketRowId: string;
}) {
    const [pending, start] = useTransition();
    const [text, setText] = useState('');
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                if (!text.trim()) return;
                start(async () => {
                    try {
                        await appendNote(slug, ticketRowId, text);
                        setText('');
                    } catch (err: any) {
                        alert('Append failed: ' + (err?.message ?? 'unknown'));
                    }
                });
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}
        >
            <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={pending}
                rows={3}
                placeholder="Append a note…"
                className="admin-form-input"
                style={{ width: '100%', resize: 'vertical', minHeight: 64 }}
            />
            <div>
                <button
                    type="submit"
                    disabled={pending || !text.trim()}
                    className="admin-action-btn"
                >
                    {pending ? 'Adding…' : 'Add note'}
                </button>
            </div>
        </form>
    );
}
