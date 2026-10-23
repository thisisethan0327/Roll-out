'use client';
/**
 * Textarea + SEND button. Calls the sendMessageAsShop server action which
 * inserts a chat_messages row with sender_id = shop_page profile id. The
 * RealtimeRefresh sibling component will trigger router.refresh() once the
 * insert lands.
 */
import { useState, useTransition, useRef } from 'react';
import { sendMessageAsShop } from '../actions';
import { Composer, ComposerLocked } from '@/components/glide-shop/Composer';

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
        return <ComposerLocked>Managers and up can post on behalf of the shop.</ComposerLocked>;
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
        <Composer
            value={body}
            onChange={setBody}
            onSubmit={submit}
            pending={isPending}
            error={error}
            label="Message"
            placeholder="Message the customer…"
            hint="Posts as the shop · Ctrl or Cmd + Enter to send"
            textareaRef={textareaRef}
        />
    );
}
