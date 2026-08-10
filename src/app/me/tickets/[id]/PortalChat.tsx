'use client';
/**
 * Customer ↔ shop chat for a single ticket. Customer-visible messages only
 * (internal staff notes never reach here — RLS filters them server-side).
 *
 * Live updates: subscribes to Realtime INSERTs on public.ticket_messages for
 * this ticket and calls router.refresh() so a staff reply appears without a
 * reload. An 8s poll backs it up if the socket drops. Scrolling is
 * container-scoped (scrollRef.scrollTop) — never scrollIntoView, which would
 * yank the whole page.
 */
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser, isSupabaseConfigured } from '@/lib/supabase/browser';
import { sendCustomerMessage } from './actions';
import { PendingButton } from '@/components/feedback';

type Message = {
    id: string;
    sender_type: string;
    sender_name: string | null;
    message: string;
    created_at: string | null;
    attachments?: any;
};

export function PortalChat({
    ticketId,
    messages,
}: {
    ticketId: string;
    messages: Message[];
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [text, setText] = useState('');
    const [err, setErr] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Realtime: refresh when a new message lands on this ticket.
    useEffect(() => {
        if (!isSupabaseConfigured()) return;
        const supabase = getSupabaseBrowser();
        const channel = supabase
            .channel(`me-ticket-${ticketId}`)
            .on(
                'postgres_changes' as any,
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'ticket_messages',
                    filter: `ticket_id=eq.${ticketId}`,
                },
                () => router.refresh(),
            )
            .subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    }, [ticketId, router]);

    // Poll fallback.
    useEffect(() => {
        const t = setInterval(() => router.refresh(), 8000);
        return () => clearInterval(t);
    }, [router]);

    // Container-scoped scroll to bottom on new messages.
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages.length]);

    const send = () => {
        const body = text;
        if (!body.trim()) return;
        setErr(null);
        start(async () => {
            const res = await sendCustomerMessage(ticketId, body);
            if (!res.ok) {
                setErr(res.error ?? 'Send failed.');
                return;
            }
            setText('');
            router.refresh();
        });
    };

    return (
        <div>
            <div
                ref={scrollRef}
                style={{
                    maxHeight: 360,
                    overflowY: 'auto',
                    border: '1px solid var(--line)',
                    background: 'var(--bg-2)',
                    padding: 10,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                }}
            >
                {messages.length === 0 ? (
                    <div className="admin-empty">NO MESSAGES YET — SAY HELLO</div>
                ) : (
                    messages.map((m) => {
                        const mine = m.sender_type === 'customer';
                        const atts = Array.isArray(m.attachments) ? m.attachments : [];
                        return (
                            <div
                                key={m.id}
                                style={{
                                    alignSelf: mine ? 'flex-end' : 'flex-start',
                                    maxWidth: '82%',
                                    border: '1px solid var(--line)',
                                    background: mine ? 'rgba(232,168,69,0.10)' : 'var(--bg-1)',
                                    borderLeft: mine ? '2px solid var(--gold)' : '1px solid var(--line)',
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
                                    {(m.sender_name ?? (mine ? 'YOU' : 'SHOP')).toUpperCase()}
                                    {m.created_at
                                        ? ` · ${new Date(m.created_at).toLocaleString(undefined, {
                                              month: 'short',
                                              day: 'numeric',
                                              hour: 'numeric',
                                              minute: '2-digit',
                                          })}`
                                        : ''}
                                </div>
                                {m.message && (
                                    <div
                                        style={{
                                            fontSize: 13,
                                            color: 'var(--text)',
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-word',
                                        }}
                                    >
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

            {err && (
                <div className="admin-login-error" style={{ marginTop: 8 }}>
                    {err}
                </div>
            )}

            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea
                    className="admin-form-input"
                    rows={2}
                    placeholder="Message the shop…"
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
                    <PendingButton
                        type="button"
                        className="admin-action-btn"
                        pending={pending}
                        pendingLabel="SENDING"
                        disabled={!text.trim()}
                        onClick={send}
                    >
                        SEND
                    </PendingButton>
                </div>
            </div>
        </div>
    );
}
