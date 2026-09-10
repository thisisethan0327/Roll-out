'use client';
import { useRef, useState, useTransition } from 'react';
import { removeProfileImageAction, uploadProfileImageAction } from './actions';

/** One image slot (avatar or banner): current image, pick a file, remove. */
export function ImageSlot({ kind, current, label, hint }: { kind: 'avatar' | 'banner'; current: string | null; label: string; hint: string }) {
    const [src, setSrc] = useState<string | null>(current);
    const [msg, setMsg] = useState<string | null>(null);
    const [pending, start] = useTransition();
    const input = useRef<HTMLInputElement>(null);
    const box = kind === 'avatar' ? { width: 96, height: 96 } : { width: '100%', maxWidth: 420, aspectRatio: '21 / 9' as const };

    return (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 20 }}>
            {src ? (
                <div
                    style={{ ...box, border: '1px solid var(--line-mid)', borderRadius: kind === 'avatar' ? '50%' : 0, background: `url(${src}) center/cover no-repeat`, flexShrink: 0 }}
                    role="img"
                    aria-label={`Current ${label.toLowerCase()}`}
                />
            ) : (
                <div
                    style={{ ...box, border: '1px dashed var(--line-mid)', borderRadius: kind === 'avatar' ? '50%' : 0, background: 'var(--bg-2)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: 'var(--track-wider)', color: 'var(--text-3)', textAlign: 'center', padding: 8 }}
                >
                    NO IMAGE YET
                </div>
            )}
            <div style={{ flex: 1, minWidth: 220 }}>
                <div className="admin-form-label">{label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 10 }}>{hint}</div>
                <input
                    ref={input}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const fd = new FormData();
                        fd.set('kind', kind);
                        fd.set('file', f);
                        start(async () => {
                            setMsg(null);
                            const res = await uploadProfileImageAction(fd);
                            if (res.ok) {
                                setSrc(URL.createObjectURL(f));
                                setMsg(res.message ?? 'Updated.');
                            } else setMsg(res.error);
                            if (input.current) input.current.value = '';
                        });
                    }}
                />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="admin-action-btn" disabled={pending} onClick={() => input.current?.click()}>
                        {pending ? 'WORKING…' : src ? 'REPLACE' : 'UPLOAD'}
                    </button>
                    {src ? (
                        <button
                            type="button"
                            className="admin-action-btn muted"
                            disabled={pending}
                            onClick={() =>
                                start(async () => {
                                    const res = await removeProfileImageAction(kind);
                                    if (res.ok) setSrc(null);
                                    setMsg(res.ok ? res.message ?? 'Removed.' : res.error);
                                })
                            }
                        >
                            REMOVE
                        </button>
                    ) : null}
                </div>
                {msg ? <div style={{ fontSize: 11, marginTop: 8, color: 'var(--text-2)' }} role="status">{msg}</div> : null}
            </div>
        </div>
    );
}
