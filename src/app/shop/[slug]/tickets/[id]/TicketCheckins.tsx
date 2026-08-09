'use client';
/**
 * Check-ins / inspections for a ticket. View existing records (with photo
 * grid), create a new check-in / progress / check-out record, upload photos
 * (compressed in-browser → signed upload URL → Storage), and delete records.
 *
 * Upload flow mirrors KioskEventImages: bytes never touch the Next server.
 */
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase/browser';
import { compressImageFile, KIOSK_IMAGE_ACCEPT } from '@/lib/kiosk-image';
import { TICKET_BUCKET, TICKET_CACHE_CONTROL } from '@/lib/ticket-media-constants';
import {
    createCheckin,
    mintCheckinPhotoTarget,
    attachCheckinPhoto,
    deleteCheckin,
} from './detail-actions';

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

type CheckinMedia = { url?: string; path?: string; caption?: string };
type Checkin = {
    id: string;
    type: string | null;
    notes: string | null;
    condition_notes: string | null;
    odometer: string | null;
    fuel_level: string | null;
    media: CheckinMedia[] | null;
    created_at: string | null;
    worker_name?: string | null;
};

const TYPE_LABEL: Record<string, string> = {
    'check-in': 'CHECK-IN',
    progress: 'PROGRESS',
    'check-out': 'CHECK-OUT',
};

async function uploadToBucket(path: string, token: string, blob: Blob) {
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.storage
        .from(TICKET_BUCKET)
        .uploadToSignedUrl(path, token, blob, {
            contentType: 'image/jpeg',
            cacheControl: TICKET_CACHE_CONTROL,
        });
    if (error) throw new Error(`Upload failed: ${error.message}`);
}

export function TicketCheckins({
    slug,
    ticketRowId,
    checkins,
    callerRole,
}: {
    slug: string;
    ticketRowId: string;
    checkins: Checkin[];
    callerRole: string;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [showForm, setShowForm] = useState(false);
    const [type, setType] = useState('check-in');
    const [conditionNotes, setConditionNotes] = useState('');
    const [odometer, setOdometer] = useState('');
    const [fuel, setFuel] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const [armedDelete, setArmedDelete] = useState<string | null>(null);
    const photoInputs = useRef<Record<string, HTMLInputElement | null>>({});
    const canManage = MANAGER_ROLES.has(callerRole);

    const submitNew = () => {
        start(async () => {
            try {
                await createCheckin(slug, ticketRowId, {
                    type,
                    condition_notes: conditionNotes,
                    odometer,
                    fuel_level: fuel,
                });
                setConditionNotes('');
                setOdometer('');
                setFuel('');
                setShowForm(false);
                router.refresh();
            } catch (e: any) {
                alert('Create check-in failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    const onPhotos = (checkinId: string, files: FileList | null) => {
        if (!files || files.length === 0) return;
        const list = Array.from(files);
        start(async () => {
            try {
                for (let i = 0; i < list.length; i++) {
                    setBusy(`UPLOADING PHOTO ${i + 1}/${list.length}…`);
                    const blob = await compressImageFile(list[i], {
                        maxDim: 2000,
                        quality: 0.82,
                    });
                    const { path, token } = await mintCheckinPhotoTarget(
                        slug,
                        ticketRowId,
                        checkinId,
                    );
                    await uploadToBucket(path, token, blob);
                    await attachCheckinPhoto(slug, ticketRowId, checkinId, path);
                }
                router.refresh();
            } catch (e: any) {
                alert('Photo upload failed: ' + (e?.message ?? 'unknown'));
            } finally {
                setBusy(null);
                const el = photoInputs.current[checkinId];
                if (el) el.value = '';
            }
        });
    };

    const remove = (checkinId: string) => {
        if (armedDelete !== checkinId) {
            setArmedDelete(checkinId);
            setTimeout(() => setArmedDelete(null), 3000);
            return;
        }
        setArmedDelete(null);
        start(async () => {
            try {
                await deleteCheckin(slug, ticketRowId, checkinId);
                router.refresh();
            } catch (e: any) {
                alert('Delete failed: ' + (e?.message ?? 'unknown'));
            }
        });
    };

    return (
        <div>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 10,
                }}
            >
                <div
                    style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 10,
                        letterSpacing: 'var(--track-widest)',
                        color: 'var(--text-3)',
                    }}
                >
                    INSPECTIONS ({checkins.length})
                </div>
                <button
                    type="button"
                    className="admin-action-btn"
                    disabled={pending}
                    onClick={() => setShowForm((v) => !v)}
                >
                    {showForm ? 'CANCEL' : '+ NEW CHECK-IN'}
                </button>
            </div>

            {showForm && (
                <div
                    style={{
                        border: '1px solid var(--line)',
                        background: 'var(--bg-2)',
                        padding: 12,
                        marginBottom: 14,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                    }}
                >
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {(['check-in', 'progress', 'check-out'] as const).map((t) => (
                            <button
                                key={t}
                                type="button"
                                className={`admin-pill ${type === t ? 'gold' : ''}`}
                                style={{ cursor: 'pointer', opacity: type === t ? 1 : 0.6 }}
                                onClick={() => setType(t)}
                            >
                                {TYPE_LABEL[t]}
                            </button>
                        ))}
                    </div>
                    <textarea
                        className="admin-form-input"
                        placeholder="Condition notes…"
                        rows={2}
                        value={conditionNotes}
                        onChange={(e) => setConditionNotes(e.target.value)}
                        style={{ width: '100%', resize: 'vertical' }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input
                            className="admin-form-input"
                            placeholder="Odometer"
                            value={odometer}
                            onChange={(e) => setOdometer(e.target.value)}
                            style={{ flex: 1 }}
                        />
                        <input
                            className="admin-form-input"
                            placeholder="Fuel level"
                            value={fuel}
                            onChange={(e) => setFuel(e.target.value)}
                            style={{ flex: 1 }}
                        />
                    </div>
                    <div>
                        <button
                            type="button"
                            className="admin-action-btn"
                            disabled={pending}
                            onClick={submitNew}
                        >
                            {pending ? 'SAVING…' : 'SAVE CHECK-IN'}
                        </button>
                    </div>
                </div>
            )}

            {checkins.length === 0 ? (
                <div className="admin-empty">NO INSPECTIONS RECORDED YET</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {checkins.map((c) => {
                        const media = Array.isArray(c.media) ? c.media : [];
                        return (
                            <div
                                key={c.id}
                                style={{
                                    border: '1px solid var(--line)',
                                    background: 'var(--bg-2)',
                                    padding: 12,
                                }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        marginBottom: 8,
                                    }}
                                >
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <span className="admin-pill gold">
                                            {TYPE_LABEL[c.type ?? ''] ?? (c.type ?? '—').toUpperCase()}
                                        </span>
                                        <span className="admin-handle">
                                            {c.created_at
                                                ? new Date(c.created_at)
                                                      .toISOString()
                                                      .slice(0, 16)
                                                      .replace('T', ' ')
                                                : '—'}
                                            {c.worker_name ? ` · ${c.worker_name}` : ''}
                                        </span>
                                    </div>
                                    {canManage && (
                                        <button
                                            type="button"
                                            className="admin-action-btn danger"
                                            disabled={pending}
                                            onClick={() => remove(c.id)}
                                        >
                                            {armedDelete === c.id ? 'SURE?' : '✕'}
                                        </button>
                                    )}
                                </div>
                                {c.condition_notes && (
                                    <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 6, whiteSpace: 'pre-wrap' }}>
                                        {c.condition_notes}
                                    </div>
                                )}
                                {(c.odometer || c.fuel_level) && (
                                    <div className="admin-handle" style={{ marginBottom: 6 }}>
                                        {c.odometer ? `ODO ${c.odometer}` : ''}
                                        {c.odometer && c.fuel_level ? ' · ' : ''}
                                        {c.fuel_level ? `FUEL ${c.fuel_level}` : ''}
                                    </div>
                                )}
                                {media.length > 0 && (
                                    <div className="admin-gallery-grid">
                                        {media.map((m, i) =>
                                            m?.url ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <a key={i} href={m.url} target="_blank" rel="noreferrer" className="admin-gallery-item">
                                                    <img src={m.url} alt={`Photo ${i + 1}`} className="admin-gallery-thumb" />
                                                </a>
                                            ) : null,
                                        )}
                                    </div>
                                )}
                                <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <input
                                        ref={(el) => {
                                            photoInputs.current[c.id] = el;
                                        }}
                                        type="file"
                                        accept={KIOSK_IMAGE_ACCEPT}
                                        capture="environment"
                                        multiple
                                        style={{ display: 'none' }}
                                        onChange={(e) => onPhotos(c.id, e.target.files)}
                                    />
                                    <button
                                        type="button"
                                        className="admin-action-btn muted"
                                        disabled={pending}
                                        onClick={() => photoInputs.current[c.id]?.click()}
                                    >
                                        + ADD PHOTOS
                                    </button>
                                    {busy && (
                                        <span
                                            style={{
                                                fontFamily: 'var(--font-display)',
                                                fontSize: 10,
                                                letterSpacing: 'var(--track-wider)',
                                                color: 'var(--gold)',
                                            }}
                                        >
                                            {busy}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
