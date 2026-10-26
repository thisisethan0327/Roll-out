'use client';
/**
 * Textarea + SEND for a unified shop DM thread (kind='shop'). Calls
 * sendShopThreadMessage, which inserts a chat_messages row with sender_id = the
 * staff member's OWN profile (not the shop_page). The RealtimeRefresh sibling
 * triggers router.refresh() once the insert lands.
 */
import { useState, useTransition, useRef } from 'react';
import { sendShopThreadMessage } from '../actions';
import { Composer, ComposerLocked } from '@/components/glide-shop/Composer';

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
        return <ComposerLocked>Installers and up can reply here.</ComposerLocked>;
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
        <Composer
            value={body}
            onChange={setBody}
            onSubmit={submit}
            pending={isPending}
            error={error}
            label="Message"
            placeholder="Message the customer…"
            hint="Replies as you"
            textareaRef={textareaRef}
        />
    );
}
