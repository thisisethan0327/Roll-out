'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Check, CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react';
import { checkHandleAction } from '@/app/signup/onboarding/actions';
import { saveProfileSettingsAction } from './actions';
import { GlideButton } from '@/components/glide/primitives';
import s from '@/components/glide-console/console.module.css';

type HandleState = { kind: 'idle' } | { kind: 'checking' } | { kind: 'ok' } | { kind: 'bad'; reason: string };

export function ProfileForm({ initial }: { initial: { displayName: string; handle: string; bio: string; location: string } }) {
    const [displayName, setDisplayName] = useState(initial.displayName);
    const [handle, setHandle] = useState(initial.handle);
    const [bio, setBio] = useState(initial.bio);
    const [location, setLocation] = useState(initial.location);
    const [handleState, setHandleState] = useState<HandleState>({ kind: 'idle' });
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [pending, start] = useTransition();
    const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
    const seq = useRef(0);

    const changedHandle = handle.trim().toLowerCase().replace(/^@+/, '') !== initial.handle;

    useEffect(() => {
        if (debounce.current) clearTimeout(debounce.current);
        const normalized = handle.trim().toLowerCase().replace(/^@+/, '');
        if (!normalized || normalized === initial.handle) {
            setHandleState({ kind: 'idle' });
            return;
        }
        setHandleState({ kind: 'checking' });
        const mine = ++seq.current;
        debounce.current = setTimeout(async () => {
            const res = await checkHandleAction(normalized);
            if (mine !== seq.current) return;
            setHandleState(res.ok ? { kind: 'ok' } : { kind: 'bad', reason: res.reason ?? 'Unavailable.' });
        }, 400);
        return () => {
            if (debounce.current) clearTimeout(debounce.current);
        };
    }, [handle, initial.handle]);

    const hintIc = { size: 15, strokeWidth: 2, 'aria-hidden': true } as const;
    const hint =
        handleState.kind === 'checking' ? (
            <p className={s.hint} aria-live="polite">
                <LoaderCircle {...hintIc} className="g-spin" />
                Checking…
            </p>
        ) : handleState.kind === 'ok' ? (
            <p className={s.hint} aria-live="polite">
                <Check {...hintIc} />
                Available. Your old handle stops working when you save.
            </p>
        ) : handleState.kind === 'bad' ? (
            <p className={`${s.hint} ${s.hintBad}`} aria-live="polite">
                <CircleAlert {...hintIc} />
                {handleState.reason}
            </p>
        ) : (
            <p className={s.hint} aria-live="polite">
                Letters, numbers and underscores, 3–20 characters.
            </p>
        );

    const canSave = !pending && displayName.trim().length > 0 && (!changedHandle || handleState.kind === 'ok');

    return (
        <form
            className={s.form}
            onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                    setMsg(null);
                    const res = await saveProfileSettingsAction({ displayName, handle, bio, location });
                    setMsg(res.ok ? { ok: true, text: res.message ?? 'Saved.' } : { ok: false, text: res.error });
                });
            }}
        >
            <div className={s.grid2f}>
                <div className={s.field}>
                    <label className={s.label} htmlFor="pf-name">
                        Display name
                    </label>
                    <input id="pf-name" type="text" className={s.input} value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} required />
                </div>
                <div className={s.field}>
                    <label className={s.label} htmlFor="pf-handle">
                        Handle
                    </label>
                    <div className={s.affix}>
                        <span aria-hidden="true">@</span>
                        <input
                            id="pf-handle"
                            type="text"
                            className={s.input}
                            value={handle}
                            onChange={(e) => setHandle(e.target.value)}
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            aria-invalid={handleState.kind === 'bad' || undefined}
                            aria-describedby="pf-handle-hint"
                            required
                        />
                    </div>
                    <div id="pf-handle-hint">{hint}</div>
                </div>
            </div>

            <div className={s.field}>
                <label className={s.label} htmlFor="pf-loc">
                    Location
                </label>
                <input id="pf-loc" type="text" className={s.input} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, ST" maxLength={80} />
            </div>

            <div className={s.field}>
                <label className={s.label} htmlFor="pf-bio">
                    Bio
                </label>
                <textarea id="pf-bio" className={s.input} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={280} rows={3} />
            </div>

            {msg ? (
                <p className={`g-note ${s.msg}`} role="status">
                    {msg.ok ? <CircleCheck size={20} strokeWidth={2} aria-hidden="true" /> : <CircleAlert size={20} strokeWidth={2} aria-hidden="true" />}
                    {msg.text}
                </p>
            ) : null}
            <div>
                <GlideButton
                    type="submit"
                    size="sm"
                    disabled={!canSave}
                    aria-busy={pending}
                    icon={pending ? <LoaderCircle size={18} strokeWidth={2} className="g-spin" /> : undefined}
                >
                    {pending ? 'Saving…' : 'Save profile'}
                </GlideButton>
            </div>
        </form>
    );
}
