'use client';
/**
 * Per-ticket messaging: customer-visible chat + internal staff notes in one
 * thread, filtered by a visibility toggle. Staff compose with a
 * customer/internal switch. Refreshes on an 8s poll (router.refresh re-runs the
 * server component loader) so replies from the customer portal appear.
 */
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendTicketMessage } from './detail-actions';

type Message = {
    id: string;
    sender_type: string;
    sender_name: string | null;
    message: string;
    visibility: string;
    created_at: string | null;
    attachments?: any;
};

export function TicketChat({
    slug,
    ticketRowId,
    messages,
}: {
    slug: string;
    ticketRowId: string;
    messages: Message[];
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [text, setText] = useState('');
    const [visibility, setVisibility] = useState<'customer' | 'internal'>('customer');
    const [filter, setFilter] = useState<'all' | 'customer' | 'internal'>('all');
    const scrollRef = useRef<HTMLDivElement>(null);

    // Poll for new messages (customer portal replies) every 8s.
    useEffect(() => {
        const t = setInterval(() => router.refresh(), 8000);
        return () => clearInterval(t);
    }, [router]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages.length]);

    const shown = messages.filter((m) =>
        filter === 'all' ? true : m.visibility === filter,
    );

    const send = () => {
        if (!text.trim()) return;
        const body = text;
        start(async () => {
            try {
                await sendTicketMessage(slug, ticketRowId, body, visibility);
                setText('');
                router.refresh();
            } catch (e: any) {
                alert('Send failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    return (
        <div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                {(['all', 'customer', 'internal'] as const).map((f) => (
                    <button
                        key={f}
                        type="button"
                        className={`admin-pill ${filter === f ? 'gold' : ''}`}
                        style={{ cursor: 'pointer', opacity: filter === f ? 1 : 0.6 }}
                        onClick={() => setFilter(f)}
                    >
                        {f.toUpperCase()}
                    </button>
                ))}
            </div>

            <div
                ref={scrollRef}
                style={{
                    maxHeight: 340,
                    overflowY: 'auto',
                    border: '1px solid var(--line)',
                    background: 'var(--bg-2)',
                    padding: 10,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                }}
            >
                {shown.length === 0 ? (
                    <div className="admin-empty">NO MESSAGES</div>
                ) : (
                    shown.map((m) => {
                        const isStaff = m.sender_type === 'staff';
                        const internal = m.visibility === 'internal';
                        const atts = Array.isArray(m.attachments) ? m.attachments : [];
                        return (
                            <div
                                key={m.id}
                                style={{
                                    alignSelf: isStaff ? 'flex-end' : 'flex-start',
                                    maxWidth: '80%',
                                    border: '1px solid var(--line)',
                                    background: internal
                                        ? 'rgba(232,168,69,0.08)'
                                        : isStaff
                                          ? 'var(--bg-1)'
                                          : 'var(--bg-3, var(--bg-2))',
                                    borderLeft: internal
                                        ? '2px solid var(--gold)'
                                        : '1px solid var(--line)',
                                    padding: '6px 10px',
                                }}
                            >
                                <div
                                    style={{
                                        fontFamily: 'var(--font-display)',
                                        fontSize: 9,
                                        letterSpacing: 'var(--track-wider)',
                                        color: 'var(--text-3)',
                                        marginBottom: 3,
                                    }}
                                >
                                    {(m.sender_name ?? m.sender_type ?? '—').toUpperCase()}
                                    {internal ? ' · INTERNAL' : ''}
                                    {m.created_at
                                        ? ` · ${new Date(m.created_at).toISOString().slice(5, 16).replace('T', ' ')}`
                                        : ''}
                                </div>
                                {m.message && (
                                    <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                        {m.message}
                                    </div>
                                )}
                                {atts.map((a: any, i: number) =>
                                    a?.url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <a key={i} href={a.url} target="_blank" rel="noreferrer">
                                            <img
                                                src={a.url}
                                                alt="attachment"
                                                style={{ maxWidth: 160, marginTop: 6, borderRadius: 4 }}
                                            />
                                        </a>
                                    ) : null,
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                    {(['customer', 'internal'] as const).map((v) => (
                        <button
                            key={v}
                            type="button"
                            className={`admin-pill ${visibility === v ? (v === 'internal' ? 'warn' : 'neon') : ''}`}
                            style={{ cursor: 'pointer', opacity: visibility === v ? 1 : 0.6 }}
                            onClick={() => setVisibility(v)}
                        >
                            {v === 'customer' ? 'TO CUSTOMER' : 'INTERNAL NOTE'}
                        </button>
                    ))}
                </div>
                <textarea
                    className="admin-form-input"
                    rows={2}
                    placeholder={
                        visibility === 'internal'
                            ? 'Internal note (staff only)…'
                            : 'Message the customer…'
                    }
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            send();
                        }
                    }}
                    style={{ width: '100%', resize: 'vertical' }}
                />
                <div>
                    <button
                        type="button"
                        className="admin-action-btn"
                        disabled={pending || !text.trim()}
                        onClick={send}
                    >
                        {pending ? 'SENDING…' : visibility === 'internal' ? 'ADD NOTE' : 'SEND'}
                    </button>
                </div>
            </div>
        </div>
    );
}
