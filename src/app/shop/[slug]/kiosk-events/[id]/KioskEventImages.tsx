'use client';
/**
 * Hero + gallery management for a kiosk event.
 *
 * Upload flow (bytes never touch the Next server):
 *   compress in-browser → server action mints a signed upload URL for a fresh
 *   versioned kiosk-media path → uploadToSignedUrl straight to Storage →
 *   attach action writes the public URL onto the event row.
 */
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase/browser';
import { compressImageFile, KIOSK_IMAGE_ACCEPT } from '@/lib/kiosk-image';
import {
    mintHeroUploadTarget,
    mintGalleryUploadTarget,
    attachHeroImage,
    appendGalleryImage,
    removeGalleryImage,
    reorderGalleryImages,
} from '../actions';

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);
const BUCKET = 'kiosk-media';

// 1-year cache — pairs with the never-overwrite versioned filenames.
const CACHE_CONTROL = '31536000';

async function uploadToBucket(path: string, token: string, blob: Blob) {
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.storage
        .from(BUCKET)
        .uploadToSignedUrl(path, token, blob, {
            contentType: 'image/jpeg',
            cacheControl: CACHE_CONTROL,
        });
    if (error) throw new Error(`Upload failed: ${error.message}`);
}

export function KioskEventImages({
    eventId,
    shopId,
    heroUrl,
    gallery,
    callerRole,
}: {
    eventId: string;
    shopId: number;
    heroUrl: string | null;
    gallery: string[];
    callerRole: string;
}) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [busyMsg, setBusyMsg] = useState<string | null>(null);
    const [localHero, setLocalHero] = useState<string | null>(heroUrl);
    const [localGallery, setLocalGallery] = useState<string[]>(gallery);
    const heroInputRef = useRef<HTMLInputElement>(null);
    const galleryInputRef = useRef<HTMLInputElement>(null);

    // Two-click "armed" remove — window.confirm is unreliable (auto-dismissed
    // in some browsers), so the first click arms the button for 3s.
    const [armedRemove, setArmedRemove] = useState<string | null>(null);
    useEffect(() => {
        if (!armedRemove) return;
        const t = setTimeout(() => setArmedRemove(null), 3000);
        return () => clearTimeout(t);
    }, [armedRemove]);

    const canManage = MANAGER_ROLES.has(callerRole);

    const onHeroFile = (file: File | null) => {
        if (!file) return;
        start(async () => {
            try {
                setBusyMsg('COMPRESSING HERO…');
                const blob = await compressImageFile(file, { maxDim: 2400, quality: 0.85 });
                setBusyMsg('UPLOADING HERO…');
                const { path, token } = await mintHeroUploadTarget(eventId, shopId);
                await uploadToBucket(path, token, blob);
                const { url } = await attachHeroImage(eventId, shopId, path);
                setLocalHero(url);
                router.refresh();
            } catch (e: any) {
                alert('Hero upload failed: ' + (e?.message ?? 'unknown'));
            } finally {
                setBusyMsg(null);
                if (heroInputRef.current) heroInputRef.current.value = '';
            }
        });
    };

    const onGalleryFiles = (files: FileList | null) => {
        if (!files || files.length === 0) return;
        const list = Array.from(files);
        start(async () => {
            try {
                for (let i = 0; i < list.length; i++) {
                    setBusyMsg(`UPLOADING PHOTO ${i + 1} / ${list.length}…`);
                    const blob = await compressImageFile(list[i], {
                        maxDim: 1600,
                        quality: 0.82,
                    });
                    const { path, token } = await mintGalleryUploadTarget(eventId, shopId);
                    await uploadToBucket(path, token, blob);
                    const { url } = await appendGalleryImage(eventId, shopId, path);
                    setLocalGallery((g) => [...g, url]);
                }
                router.refresh();
            } catch (e: any) {
                alert('Gallery upload failed: ' + (e?.message ?? 'unknown'));
                router.refresh();
            } finally {
                setBusyMsg(null);
                if (galleryInputRef.current) galleryInputRef.current.value = '';
            }
        });
    };

    const move = (index: number, dir: -1 | 1) => {
        const target = index + dir;
        if (target < 0 || target >= localGallery.length) return;
        const next = [...localGallery];
        [next[index], next[target]] = [next[target], next[index]];
        setLocalGallery(next);
        start(async () => {
            try {
                await reorderGalleryImages(eventId, shopId, next);
                router.refresh();
            } catch (e: any) {
                alert('Reorder failed: ' + (e?.message ?? 'unknown'));
                setLocalGallery(localGallery);
            }
        });
    };

    const remove = (url: string) => {
        if (armedRemove !== url) {
            setArmedRemove(url);
            return;
        }
        setArmedRemove(null);
        const prev = localGallery;
        setLocalGallery(prev.filter((u) => u !== url));
        start(async () => {
            try {
                await removeGalleryImage(eventId, shopId, url);
                router.refresh();
            } catch (e: any) {
                alert('Remove failed: ' + (e?.message ?? 'unknown'));
                setLocalGallery(prev);
            }
        });
    };

    return (
        <div>
            <SectionHeading>HERO IMAGE</SectionHeading>
            {localHero ? (
                <img src={localHero} alt="Event hero" className="admin-hero-preview" />
            ) : (
                <div className="admin-empty">NO HERO IMAGE — THE KIOSK FALLS BACK TO HOST ART.</div>
            )}
            {canManage && (
                <div style={{ marginTop: 8 }}>
                    <input
                        ref={heroInputRef}
                        type="file"
                        accept={KIOSK_IMAGE_ACCEPT}
                        style={{ display: 'none' }}
                        onChange={(e) => onHeroFile(e.target.files?.[0] ?? null)}
                    />
                    <button
                        type="button"
                        className="admin-action-btn"
                        disabled={pending}
                        onClick={() => heroInputRef.current?.click()}
                    >
                        {localHero ? 'REPLACE HERO' : 'UPLOAD HERO'}
                    </button>
                </div>
            )}

            <SectionHeading>GALLERY ({localGallery.length})</SectionHeading>
            {localGallery.length === 0 ? (
                <div className="admin-empty">NO PHOTOS — THE KIOSK HIDES THE PHOTO STRIP.</div>
            ) : (
                <div className="admin-gallery-grid">
                    {localGallery.map((url, i) => (
                        <div key={url} className="admin-gallery-item">
                            <img src={url} alt={`Gallery ${i + 1}`} className="admin-gallery-thumb" />
                            {canManage && (
                                <div className="admin-gallery-controls">
                                    <button
                                        type="button"
                                        className="admin-action-btn muted"
                                        disabled={pending || i === 0}
                                        onClick={() => move(i, -1)}
                                        aria-label="Move earlier"
                                    >
                                        ‹
                                    </button>
                                    <button
                                        type="button"
                                        className="admin-action-btn muted"
                                        disabled={pending || i === localGallery.length - 1}
                                        onClick={() => move(i, 1)}
                                        aria-label="Move later"
                                    >
                                        ›
                                    </button>
                                    <button
                                        type="button"
                                        className="admin-action-btn danger"
                                        disabled={pending}
                                        onClick={() => remove(url)}
                                        aria-label="Remove photo"
                                    >
                                        {armedRemove === url ? 'SURE?' : '✕'}
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
            {canManage && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                        ref={galleryInputRef}
                        type="file"
                        accept={KIOSK_IMAGE_ACCEPT}
                        multiple
                        style={{ display: 'none' }}
                        onChange={(e) => onGalleryFiles(e.target.files)}
                    />
                    <button
                        type="button"
                        className="admin-action-btn"
                        disabled={pending}
                        onClick={() => galleryInputRef.current?.click()}
                    >
                        + ADD PHOTOS
                    </button>
                    {busyMsg && (
                        <span
                            style={{
                                fontFamily: 'var(--font-display)',
                                fontSize: 10,
                                letterSpacing: 'var(--track-wider)',
                                color: 'var(--gold)',
                            }}
                        >
                            {busyMsg}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
    return (
        <div
            style={{
                marginTop: 14,
                marginBottom: 6,
                fontFamily: 'var(--font-display)',
                fontSize: 11,
                letterSpacing: 'var(--track-wider)',
                color: 'var(--gold)',
                borderTop: '1px solid var(--rule)',
                paddingTop: 10,
            }}
        >
            {children}
        </div>
    );
}
