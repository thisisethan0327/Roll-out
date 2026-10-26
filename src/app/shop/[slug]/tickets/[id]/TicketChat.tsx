'use client';
/**
 * Per-ticket messaging: customer-visible chat + internal staff notes in one
 * thread, filtered by a visibility toggle. Staff compose with a
 * customer/internal switch. Refreshes on an 8s poll (router.refresh re-runs the
 * server component loader) so replies from the customer portal appear.
 * Photos: pick a file -> compressed in-browser (JPG/PNG/WEBP up to 20 MB raw,
 * resized to 1600px) -> signed upload straight to Storage -> sent as its own
 * message with the current TO CUSTOMER / INTERNAL visibility.
 */
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { mintChatPhotoTarget, sendTicketMessage, sendTicketPhotoMessage } from './detail-actions';
import { ImagePlus } from 'lucide-react';
import { Composer } from '@/components/glide-shop/Composer';
import { cx, shopStyles as sh } from '@/components/glide-shop/parts';
import { getSupabaseBrowser } from '@/lib/supabase/browser';
import { compressImageFile, KIOSK_IMAGE_ACCEPT } from '@/lib/kiosk-image';
import { TICKET_BUCKET, TICKET_CACHE_CONTROL } from '@/lib/ticket-media-constants';
import { toast } from '@/components/glide/Toast';

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
    const fileRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [photoError, setPhotoError] = useState<string | null>(null);

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
                toast.error('Send failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    const onPhoto = async (files: FileList | null) => {
        const file = files?.[0];
        if (!file || uploading) return;
        setPhotoError(null);
        setUploading(true);
        try {
            const blob = await compressImageFile(file, { maxDim: 1600, quality: 0.82 });
            const { path, token } = await mintChatPhotoTarget(slug, ticketRowId);
            const { error } = await getSupabaseBrowser()
                .storage.from(TICKET_BUCKET)
                .uploadToSignedUrl(path, token, blob, {
                    contentType: 'image/jpeg',
                    cacheControl: TICKET_CACHE_CONTROL,
                });
            if (error) throw new Error(`Upload failed: ${error.message}`);
            await sendTicketPhotoMessage(slug, ticketRowId, path, visibility);
            router.refresh();
        } catch (e: any) {
            setPhotoError(e?.message ?? 'Photo upload failed');
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    return (
        <div className={sh.chatBox}>
            <div className={sh.tabs} role="group" aria-label="Show messages">
                {(['all', 'customer', 'internal'] as const).map((f) => (
                    <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                        {f === 'all' ? 'All' : f === 'customer' ? 'Customer' : 'Internal'}
                    </button>
                ))}
            </div>

            <div ref={scrollRef} className={cx(sh.chat, sh.chatScroll)}>
                {shown.length === 0 ? (
                    <p className={sh.muted} style={{ margin: 'auto', fontSize: 14.5 }}>
                        No messages
                    </p>
                ) : (
                    shown.map((m) => {
                        const isStaff = m.sender_type === 'staff';
                        const internal = m.visibility === 'internal';
                        const atts = Array.isArray(m.attachments) ? m.attachments : [];
                        return (
                            <div
                                key={m.id}
                                className={cx(sh.msg, isStaff ? sh.msgOut : sh.msgIn, internal && sh.msgInternal)}
                            >
                                <span className={sh.msgMeta}>
                                    <b>{m.sender_name ?? m.sender_type ?? '—'}</b>
                                    {internal ? ' · Internal note' : ''}
                                    {m.created_at
                                        ? ` · ${new Date(m.created_at).toISOString().slice(5, 16).replace('T', ' ')}`
                                        : ''}
                                </span>
                                {m.message ? <div className={sh.bubble}>{m.message}</div> : null}
                                {atts.map((a: any, i: number) =>
                                    a?.url ? (
                                        <a key={i} href={a.url} target="_blank" rel="noreferrer" className={sh.att}>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={a.url} alt="Photo attachment" />
                                        </a>
                                    ) : null,
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            <div className={sh.tabs} role="group" aria-label="Send as">
                {(['customer', 'internal'] as const).map((v) => (
                    <button key={v} type="button" aria-pressed={visibility === v} onClick={() => setVisibility(v)}>
                        {v === 'customer' ? 'To customer' : 'Internal note'}
                    </button>
                ))}
            </div>
            <input
                ref={fileRef}
                type="file"
                accept={KIOSK_IMAGE_ACCEPT}
                hidden
                onChange={(e) => onPhoto(e.target.files)}
            />
            <Composer
                value={text}
                onChange={setText}
                onSubmit={send}
                pending={pending || uploading}
                error={photoError}
                label={visibility === 'internal' ? 'Internal note' : 'Message to the customer'}
                placeholder={visibility === 'internal' ? 'Internal note (staff only)…' : 'Message the customer…'}
                sendLabel={visibility === 'internal' ? 'Add note' : 'Send'}
                hint={
                    uploading
                        ? 'Sending photo…'
                        : visibility === 'internal'
                          ? 'Staff only · Ctrl or Cmd + Enter to add'
                          : 'The customer sees this · Ctrl or Cmd + Enter to send'
                }
                extra={
                    <button
                        type="button"
                        className="g-cb g-cb--fill"
                        disabled={uploading || pending}
                        onClick={() => fileRef.current?.click()}
                        aria-label={uploading ? 'Sending photo' : 'Add a photo'}
                        title="Add a photo"
                    >
                        <ImagePlus size={19} strokeWidth={2} aria-hidden="true" />
                    </button>
                }
            />
        </div>
    );
}
