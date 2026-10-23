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
import { LoaderCircle, SendHorizontal } from 'lucide-react';
import { ErrorLine } from '@/components/glide-tickets/parts';

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
            <div ref={scrollRef} className="gt-chat" role="log" aria-label="Messages with the shop">
                {messages.length === 0 ? (
                    <p className="gt-chat-empty">No messages yet. Say hello.</p>
                ) : (
                    messages.map((m) => {
                        const mine = m.sender_type === 'customer';
                        const atts = Array.isArray(m.attachments) ? m.attachments : [];
                        return (
                            <div key={m.id} className={`gt-msg${mine ? ' is-mine' : ''}`}>
                                <small>
                                    {m.sender_name ?? (mine ? 'You' : 'Shop')}
                                    {m.created_at
                                        ? ` · ${new Date(m.created_at).toLocaleString(undefined, {
                                              month: 'short',
                                              day: 'numeric',
                                              hour: 'numeric',
                                              minute: '2-digit',
                                          })}`
                                        : ''}
                                </small>
                                {m.message && <p>{m.message}</p>}
                                {atts.map((a: any, i: number) =>
                                    a?.url ? (
                                        <a key={i} href={a.url} target="_blank" rel="noreferrer">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={a.url} alt="attachment" />
                                        </a>
                                    ) : null,
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {err && (
                <div style={{ margin: '10px 16px 0' }}>
                    <ErrorLine>{err}</ErrorLine>
                </div>
            )}

            <div className="gt-compose">
                <div className="gt-fields">
                    <label className="gt-fld">
                        <span>Message the shop</span>
                        <textarea
                            rows={2}
                            placeholder="Write a message…"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                    e.preventDefault();
                                    send();
                                }
                            }}
                        />
                    </label>
                </div>
                <button
                    type="button"
                    className="gt-send"
                    disabled={pending || !text.trim()}
                    onClick={send}
                    aria-label={pending ? 'Sending' : 'Send'}
                    aria-busy={pending || undefined}
                >
                    {pending ? (
                        <LoaderCircle size={22} strokeWidth={2} className="g-spin" aria-hidden="true" />
                    ) : (
                        <SendHorizontal size={22} strokeWidth={2} aria-hidden="true" />
                    )}
                </button>
            </div>
            <p className="gt-hint">Ctrl or Cmd + Enter sends.</p>
        </div>
    );
}
