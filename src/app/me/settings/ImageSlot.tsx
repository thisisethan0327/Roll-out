'use client';
import { useRef, useState, useTransition } from 'react';
import { ImagePlus, LoaderCircle, Trash2 } from 'lucide-react';
import { removeProfileImageAction, uploadProfileImageAction } from './actions';
import s from '@/components/glide-console/console.module.css';
import st from './settings.module.css';

/** One image slot (avatar or banner): current image, pick a file, remove. */
export function ImageSlot({ kind, current, label, hint }: { kind: 'avatar' | 'banner'; current: string | null; label: string; hint: string }) {
    const [src, setSrc] = useState<string | null>(current);
    const [msg, setMsg] = useState<string | null>(null);
    const [pending, start] = useTransition();
    const input = useRef<HTMLInputElement>(null);
    const shape = kind === 'avatar' ? st.slotAvatar : st.slotBanner;

    return (
        <div className={`${st.slot} ${kind === 'banner' ? st.slotWide : ''}`}>
            {src ? (
                <div className={shape} style={{ backgroundImage: `url(${src})` }} role="img" aria-label={`Current ${label.toLowerCase()}`} />
            ) : (
                <div className={`${shape} ${st.slotEmpty}`}>
                    <ImagePlus size={22} strokeWidth={1.75} aria-hidden="true" />
                    <span>No {label.toLowerCase()} yet</span>
                </div>
            )}
            <div className={st.slotBody}>
                <b className={st.slotLabel}>{label}</b>
                <p className={s.small}>{hint}</p>
                <input
                    ref={input}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: 'none' }}
                    aria-label={`Choose a ${label.toLowerCase()} image`}
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
                <div className={s.actRow} style={{ marginTop: 10 }}>
                    <button type="button" className="g-sec" disabled={pending} aria-busy={pending} onClick={() => input.current?.click()}>
                        {pending ? <LoaderCircle size={17} strokeWidth={2} className="g-spin" aria-hidden="true" /> : <ImagePlus size={17} strokeWidth={2} aria-hidden="true" />}
                        {pending ? 'Working…' : src ? 'Replace' : 'Upload'}
                    </button>
                    {src ? (
                        <button
                            type="button"
                            className={`g-sec ${s.danger}`}
                            disabled={pending}
                            onClick={() =>
                                start(async () => {
                                    const res = await removeProfileImageAction(kind);
                                    if (res.ok) setSrc(null);
                                    setMsg(res.ok ? res.message ?? 'Removed.' : res.error);
                                })
                            }
                        >
                            <Trash2 size={17} strokeWidth={2} aria-hidden="true" />
                            Remove
                        </button>
                    ) : null}
                </div>
                {msg ? (
                    <p className={s.hint} role="status" style={{ marginTop: 8 }}>
                        {msg}
                    </p>
                ) : null}
            </div>
        </div>
    );
}
