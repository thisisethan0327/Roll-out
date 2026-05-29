'use client';
/**
 * Textarea + SEND button. Calls the sendMessageAsShop server action which
 * inserts a chat_messages row with sender_id = shop_page profile id. The
 * RealtimeRefresh sibling component will trigger router.refresh() once the
 * insert lands.
 */
import { useState, useTransition, useRef } from 'react';
import { sendMessageAsShop } from '../actions';

export function MessageComposer({
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
                MANAGER+ REQUIRED TO POST ON BEHALF OF THE SHOP.
            </div>
        );
    }

    const submit = () => {
        const trimmed = body.trim();
        if (!trimmed || isPending) return;
        setError(null);
        startTransition(async () => {
            try {
                await sendMessageAsShop(threadId, shopId, trimmed);
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
                    // Cmd/Ctrl+Enter to send; plain Enter inserts newline.
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
                    POSTS AS THE SHOP · ⌘/CTRL+ENTER TO SEND
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
