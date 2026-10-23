'use client';
/**
 * Reason gate for the admin DM viewer (Part 2). Nothing is fetched until the
 * admin types a reason; the reason goes to a server action (a POST body, never
 * a URL) which calls the logging RPC on the admin's own session. The data lives
 * only in this component's state: a reload asks for a reason again, and so
 * writes a new log row.
 */
import Link from 'next/link';
import { useState, useTransition } from 'react';
import {
    adminListThreadsAction,
    adminReadThreadAction,
    type DmAuditRow,
    type DmMessage,
    type DmThread,
} from './actions';
import { ChevronRight, Eye, Paperclip, ShieldAlert } from 'lucide-react';
import { adminStyles as a, adminStyles as st, sentence } from '@/components/glide-admin/parts';

const ic = { size: 15, strokeWidth: 2, 'aria-hidden': true } as const;

const REASON_MIN = 10;
const REASON_MAX = 500;

function stamp(iso: string | null | undefined): string {
    return iso ? new Date(iso).toISOString().slice(0, 16).replace('T', ' ') : '—';
}

function Gate({
    what,
    onSubmit,
    pending,
    error,
}: {
    what: string;
    onSubmit: (reason: string) => void;
    pending: boolean;
    error: string | null;
}) {
    const [reason, setReason] = useState('');
    const ok = reason.trim().length >= REASON_MIN;
    return (
        <div className={`${a.card} ${a.formCard}`}>
            <div className={a.note} style={{ boxShadow: 'none', padding: 0 }}>
                <ShieldAlert size={20} strokeWidth={2} aria-hidden="true" />
                <span>
                    <b>Private messages, for disputes only.</b> Every view is logged with your name and reason.
                </span>
            </div>
            <label className={a.field}>
                <span className="admin-form-label">
                    Reason for viewing ({REASON_MIN}–{REASON_MAX} characters, required)
                </span>
                <textarea
                    className="admin-form-input"
                    rows={3}
                    maxLength={REASON_MAX}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={pending}
                    placeholder="e.g. Dispute #123: buyer says seller threatened them"
                />
            </label>
            {error && <div className="admin-login-error" role="alert">{error}</div>}
            <div>
                <button className="admin-action-btn danger" disabled={pending || !ok} onClick={() => onSubmit(reason)}>
                    <Eye {...ic} /> {pending ? 'Logging…' : `Log and ${what}`}
                </button>
            </div>
        </div>
    );
}
export function ThreadsGate({ profileId, handle }: { profileId: string; handle: string }) {
    const [pending, start] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [threads, setThreads] = useState<DmThread[] | null>(null);

    if (!threads) {
        return (
            <Gate
                what="list threads"
                pending={pending}
                error={error}
                onSubmit={(reason) =>
                    start(async () => {
                        setError(null);
                        const res = await adminListThreadsAction(profileId, reason);
                        if (res.ok) setThreads(res.threads);
                        else setError(res.error);
                    })
                }
            />
        );
    }

    return (
        <div className={a.stack}>
            <div className={a.note} role="status">
                <Eye size={18} strokeWidth={2} aria-hidden="true" />
                <span>
                    This view is logged. {threads.length} thread{threads.length === 1 ? '' : 's'} for @{handle}. Opening a
                    thread asks for a reason again.
                </span>
            </div>
            {threads.length === 0 ? (
                <div className="admin-empty">No threads.</div>
            ) : (
                <div className="admin-table-wrap">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Thread</th>
                                <th>Kind</th>
                                <th>Members</th>
                                <th>Messages</th>
                                <th>Last message</th>
                                <th>Their state</th>
                                <th>
                                    <span className="g-sr">Open</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {threads.map((t) => (
                                <tr key={t.id}>
                                    <td>{t.name || `…${t.id.slice(-6)}`}</td>
                                    <td>{t.kind ? sentence(t.kind) : '—'}</td>
                                    <td>
                                        {t.members
                                            .map((m) => (m.handle ? `@${m.handle}` : (m.display_name ?? '?')))
                                            .join(', ') || '—'}
                                    </td>
                                    <td className={a.num}>{t.message_count}</td>
                                    <td className={a.time}>{stamp(t.last_message_at)}</td>
                                    <td>{t.state ?? '—'}</td>
                                    <td style={{ textAlign: 'right' }}>
                                        <Link
                                            href={`/admin/users/${profileId}/messages/${t.id}`}
                                            className="admin-action-btn"
                                        >
                                            Open <ChevronRight {...ic} />
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export function ThreadGate({ profileId, threadId }: { profileId: string; threadId: string }) {
    const [pending, start] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [reason, setReason] = useState<string | null>(null);
    const [view, setView] = useState<{
        thread: Record<string, any>;
        messages: DmMessage[];
        hasMore: boolean;
        audit: DmAuditRow[];
    } | null>(null);

    const load = (r: string, before?: string | null) =>
        start(async () => {
            setError(null);
            const res = await adminReadThreadAction(threadId, r, before ?? null);
            if (!res.ok) return setError(res.error);
            setReason(r);
            setView((prev) =>
                before && prev
                    ? { ...res, messages: [...res.messages, ...prev.messages] }
                    : { thread: res.thread, messages: res.messages, hasMore: res.hasMore, audit: res.audit },
            );
        });

    if (!view || !reason) {
        return <Gate what="read thread" pending={pending} error={error} onSubmit={(r) => load(r)} />;
    }

    const members: { profile_id: string; handle: string | null; display_name: string | null }[] =
        view.thread.members ?? [];
    const oldest = view.messages[0]?.created_at ?? null;

    return (
        <div className={a.stack}>
            <div className={a.note} role="status">
                <Eye size={18} strokeWidth={2} aria-hidden="true" />
                <span>
                    This view is logged. {view.thread.name ? `${String(view.thread.name)} · ` : ''}
                    {members.map((m) => (m.handle ? `@${m.handle}` : (m.display_name ?? '?'))).join(', ')}
                </span>
            </div>

            {view.hasMore && oldest && (
                <div>
                    <button className="admin-action-btn muted" disabled={pending} onClick={() => load(reason, oldest)}>
                        {pending ? 'Loading…' : 'Load earlier (logged again)'}
                    </button>
                </div>
            )}
            {error && <div className="admin-login-error" role="alert">{error}</div>}

            <div className={a.thread}>
                {view.messages.length === 0 ? (
                    <div className="admin-empty" style={{ margin: 'auto' }}>
                        No messages.
                    </div>
                ) : (
                    view.messages.map((m) => {
                        const mine = m.sender_id === profileId;
                        const deleted = !!m.deleted_at;
                        return (
                            <div key={m.id} className={[a.msg, mine ? a.msgMine : '', deleted ? a.msgGone : ''].join(' ')}>
                                <div className={a.msgWho}>
                                    {m.sender_handle ? `@${m.sender_handle}` : '?'}
                                    {deleted ? ' · deleted' : ''}
                                    {m.edited_at && !deleted ? ' · edited' : ''}
                                </div>
                                <div className={a.bubble}>{m.body || (m.media_urls?.length ? '(attachment)' : '')}</div>
                                {m.media_urls && m.media_urls.length > 0 && (
                                    <div className={a.actRow}>
                                        {m.media_urls.map((u) => (
                                            <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="text-link">
                                                <Paperclip {...ic} /> Attachment
                                            </a>
                                        ))}
                                    </div>
                                )}
                                <div className={a.msgWho}>{stamp(m.created_at)} UTC</div>
                            </div>
                        );
                    })
                )}
            </div>
            <div className={a.group}>Last {view.audit.length} views of this thread</div>
            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>When (UTC)</th>
                            <th>Admin</th>
                            <th>Action</th>
                            <th>Reason</th>
                        </tr>
                    </thead>
                    <tbody>
                        {view.audit.map((a, i) => (
                            <tr key={`${a.at}-${i}`}>
                                <td className={st.time}>{stamp(a.at)}</td>
                                <td>{a.actor ? `@${a.actor}` : '—'}</td>
                                <td>
                                    <span className="admin-pill gold">{a.action}</span>
                                </td>
                                <td style={{ maxWidth: 360, whiteSpace: 'pre-wrap' }}>{a.reason ?? '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
