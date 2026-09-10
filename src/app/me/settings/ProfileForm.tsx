'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { checkHandleAction } from '@/app/signup/onboarding/actions';
import { saveProfileSettingsAction } from './actions';
import { PendingButton } from '@/components/feedback';

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

    const hint =
        handleState.kind === 'checking'
            ? { text: 'CHECKING…', color: 'var(--text-3)' }
            : handleState.kind === 'ok'
              ? { text: '✓ AVAILABLE · YOUR OLD HANDLE STOPS WORKING WHEN YOU SAVE', color: 'var(--gold)' }
              : handleState.kind === 'bad'
                ? { text: handleState.reason.toUpperCase(), color: '#e5484d' }
                : { text: 'LETTERS, NUMBERS, UNDERSCORES · 3–20 CHARS', color: 'var(--text-3)' };

    const canSave = !pending && displayName.trim().length > 0 && (!changedHandle || handleState.kind === 'ok');

    return (
        <form
            className="admin-form"
            onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                    setMsg(null);
                    const res = await saveProfileSettingsAction({ displayName, handle, bio, location });
                    setMsg(res.ok ? { ok: true, text: res.message ?? 'Saved.' } : { ok: false, text: res.error });
                });
            }}
        >
            <div className="admin-form-label">DISPLAY NAME</div>
            <input type="text" className="admin-form-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} required />

            <div className="admin-form-label">HANDLE</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono, monospace)' }}>@</span>
                <input type="text" className="admin-form-input" value={handle} onChange={(e) => setHandle(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} style={{ flex: 1 }} required />
            </div>
            <div style={{ fontSize: 10, letterSpacing: 'var(--track-wider)', color: hint.color, fontFamily: 'var(--font-display)', minHeight: 14, marginBottom: 12 }}>{hint.text}</div>

            <div className="admin-form-label">LOCATION</div>
            <input type="text" className="admin-form-input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, ST" maxLength={80} />

            <div className="admin-form-label">BIO</div>
            <textarea className="admin-form-input" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={280} rows={3} style={{ resize: 'vertical', fontFamily: 'inherit' }} />

            {msg ? (
                <div className="admin-login-error" role="status" style={msg.ok ? { borderColor: 'var(--gold)', background: 'rgba(255,183,51,0.08)', color: 'var(--text)' } : undefined}>
                    {msg.text}
                </div>
            ) : null}
            <PendingButton type="submit" pending={pending} pendingLabel="SAVING" disabled={!canSave} className="admin-login-btn">
                SAVE PROFILE ›
            </PendingButton>
        </form>
    );
}
