'use client';
/**
 * Textarea + SEND for a unified shop DM thread (kind='shop'). Calls
 * sendShopThreadMessage, which inserts a chat_messages row with sender_id = the
 * staff member's OWN profile (not the shop_page). The RealtimeRefresh sibling
 * triggers router.refresh() once the insert lands.
 */
import { useState, useTransition, useRef } from 'react';
import { sendShopThreadMessage } from '../actions';

export function ShopThreadComposer({
    threadId,
    shopId,
    canSend,
}: {
    threadId: string;
    shopId: number;
    canSend: boolean;
}) {
    const [body, setBody] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    if (!canSend) {
        return (
            <div
                style={{
                    padding: 16,
                    border: '1px solid var(--line-mid)',
                    background: 'var(--bg-2)',
                    color: 'var(--text-2)',
                    fontSize: 12,
                    fontFamily: 'var(--font-display)',
                    letterSpacing: 'var(--track-wider)',
                }}
            >
                INSTALLER+ REQUIRED TO REPLY.
            </div>
        );
    }

    const submit = () => {
        const trimmed = body.trim();
        if (!trimmed || isPending) return;
        setError(null);
        startTransition(async () => {
            try {
                await sendShopThreadMessage(threadId, shopId, trimmed);
                setBody('');
                textareaRef.current?.focus();
            } catch (e: any) {
                setError(e?.message ?? 'Failed to send.');
            }
        });
    };

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: 12,
                border: '1px solid var(--line-mid)',
                background: 'var(--bg-1)',
            }}
        >
            {error && (
                <div
                    style={{
                        fontSize: 11,
                        color: 'var(--warn)',
                        fontFamily: 'var(--font-display)',
                        letterSpacing: 'var(--track-wider)',
                    }}
                >
                    {error}
                </div>
            )}
            <textarea
                ref={textareaRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        submit();
                    }
                }}
                placeholder="MESSAGE THE CUSTOMER…"
                disabled={isPending}
                rows={3}
                style={{
                    width: '100%',
                    background: 'var(--bg-0)',
                    color: 'var(--text)',
                    border: '1px solid var(--line-mid)',
                    padding: 10,
                    fontFamily: 'inherit',
                    fontSize: 14,
                    resize: 'vertical',
                    minHeight: 60,
                }}
            />
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                }}
            >
                <div
                    style={{
                        fontSize: 10,
                        color: 'var(--text-2)',
                        fontFamily: 'var(--font-display)',
                        letterSpacing: 'var(--track-wider)',
                    }}
                >
                    REPLIES AS YOU · ⌘/CTRL+ENTER TO SEND
                </div>
                <button
                    type="button"
                    className="admin-action-btn"
                    onClick={submit}
                    disabled={isPending || !body.trim()}
                >
                    {isPending ? 'SENDING…' : 'SEND ›'}
                </button>
            </div>
        </div>
    );
}
