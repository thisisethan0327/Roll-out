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
import { PendingButton } from '@/components/feedback';
import { getSupabaseBrowser } from '@/lib/supabase/browser';
import { compressImageFile, KIOSK_IMAGE_ACCEPT } from '@/lib/kiosk-image';
import { TICKET_BUCKET, TICKET_CACHE_CONTROL } from '@/lib/ticket-media-constants';

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
                alert('Send failed: ' + (e?.message ?? 'unknown'));
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
                                        ? 'var(--gold-glow)'
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
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <PendingButton
                        type="button"
                        className="admin-action-btn"
                        pending={pending}
                        pendingLabel="SENDING"
                        disabled={!text.trim() || uploading}
                        onClick={send}
                    >
                        {visibility === 'internal' ? 'ADD NOTE' : 'SEND'}
                    </PendingButton>
                    <input
                        ref={fileRef}
                        type="file"
                        accept={KIOSK_IMAGE_ACCEPT}
                        hidden
                        onChange={(e) => onPhoto(e.target.files)}
                    />
                    <button
                        type="button"
                        className="admin-action-btn muted"
                        disabled={uploading || pending}
                        onClick={() => fileRef.current?.click()}
                    >
                        {uploading ? 'SENDING PHOTO…' : '+ PHOTO'}
                    </button>
                    {photoError && (
                        <span role="alert" style={{ color: 'var(--warn)', fontSize: 12 }}>
                            {photoError}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
