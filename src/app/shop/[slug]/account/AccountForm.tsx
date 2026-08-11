'use client';
/**
 * MY ACCOUNT edit form (client). Live handle availability (debounced server
 * check, shared with onboarding rules), display name, and optional bio. Submits
 * via saveAccountAction, which — unlike onboarding — returns a result instead of
 * redirecting, so we show an inline "saved" state and refresh the route (which
 * re-renders the sidebar's SIGNED IN AS block with the new handle/name).
 */
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { checkAccountHandleAction, saveAccountAction } from './actions';

type HandleState =
    | { kind: 'idle' }
    | { kind: 'current' }
    | { kind: 'checking' }
    | { kind: 'ok' }
    | { kind: 'bad'; reason: string };

function normalize(raw: string): string {
    return raw.trim().toLowerCase().replace(/^@+/, '');
}

export function AccountForm({
    slug,
    initialHandle,
    initialDisplayName,
    initialBio,
}: {
    slug: string;
    initialHandle: string;
    initialDisplayName: string;
    initialBio: string;
}) {
    const router = useRouter();
    const [handle, setHandle] = useState(initialHandle);
    const [displayName, setDisplayName] = useState(initialDisplayName);
    const [bio, setBio] = useState(initialBio);
    const [handleState, setHandleState] = useState<HandleState>({ kind: 'current' });
    const [formErr, setFormErr] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [pending, startTransition] = useTransition();
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const seqRef = useRef(0);

    // Debounced availability check as the user types.
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const normalized = normalize(handle);
        if (!normalized) {
            setHandleState({ kind: 'idle' });
            return;
        }
        // Unchanged handle → no need to check; it's already yours.
        if (normalized === normalize(initialHandle)) {
            setHandleState({ kind: 'current' });
            return;
        }
        setHandleState({ kind: 'checking' });
        const mySeq = ++seqRef.current;
        debounceRef.current = setTimeout(async () => {
            const res = await checkAccountHandleAction(slug, normalized);
            if (mySeq !== seqRef.current) return; // ignore stale responses
            setHandleState(
                res.ok
                    ? { kind: 'ok' }
                    : { kind: 'bad', reason: res.reason ?? 'Unavailable.' },
            );
        }, 400);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [handle, initialHandle, slug]);

    const dirty =
        normalize(handle) !== normalize(initialHandle) ||
        displayName !== initialDisplayName ||
        bio !== initialBio;

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setFormErr(null);
        setSaved(false);
        if (handleState.kind === 'bad') {
            setFormErr(handleState.reason);
            return;
        }
        if (!displayName.trim()) {
            setFormErr('Enter a display name.');
            return;
        }
        startTransition(async () => {
            const res = await saveAccountAction(slug, { handle, displayName, bio });
            if (!res.ok) {
                setFormErr(res.error);
                return;
            }
            setSaved(true);
            setHandleState({ kind: 'current' });
            // Re-render the layout so the sidebar reflects the new handle/name.
            router.refresh();
        });
    };

    const hint = (() => {
        switch (handleState.kind) {
            case 'checking':
                return { text: 'CHECKING…', color: 'var(--text-3)' };
            case 'ok':
                return { text: '✓ AVAILABLE', color: 'var(--gold)' };
            case 'current':
                return { text: 'YOUR CURRENT HANDLE', color: 'var(--text-3)' };
            case 'bad':
                return { text: handleState.reason.toUpperCase(), color: '#e5484d' };
            default:
                return {
                    text: 'LETTERS, NUMBERS, UNDERSCORES · 3–20 CHARS',
                    color: 'var(--text-3)',
                };
        }
    })();

    const canSubmit =
        !pending &&
        dirty &&
        displayName.trim().length > 0 &&
        handleState.kind !== 'bad' &&
        handleState.kind !== 'checking';

    return (
        <form onSubmit={submit} className="admin-form" style={{ maxWidth: 560 }}>
            <div className="admin-form-label">HANDLE</div>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 4,
                }}
            >
                <span
                    style={{
                        color: 'var(--text-3)',
                        fontFamily: 'var(--font-mono, monospace)',
                    }}
                >
                    @
                </span>
                <input
                    type="text"
                    value={handle}
                    onChange={(e) => {
                        setHandle(e.target.value);
                        setSaved(false);
                    }}
                    placeholder="your_handle"
                    className="admin-form-input"
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="off"
                    spellCheck={false}
                    style={{ flex: 1, marginBottom: 0 }}
                />
            </div>
            <div
                style={{
                    fontSize: 10,
                    letterSpacing: 'var(--track-wider)',
                    color: hint.color,
                    fontFamily: 'var(--font-display)',
                    minHeight: 14,
                    marginBottom: 12,
                }}
            >
                {hint.text}
            </div>

            <div className="admin-form-label">DISPLAY NAME</div>
            <input
                type="text"
                value={displayName}
                onChange={(e) => {
                    setDisplayName(e.target.value);
                    setSaved(false);
                }}
                placeholder="What people call you"
                className="admin-form-input"
                maxLength={60}
            />

            <div className="admin-form-label">BIO · OPTIONAL</div>
            <textarea
                value={bio}
                onChange={(e) => {
                    setBio(e.target.value);
                    setSaved(false);
                }}
                placeholder="Your builds, your lane… (optional)"
                className="admin-form-input"
                maxLength={280}
                rows={3}
                style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />

            {formErr && (
                <div className="admin-login-error" style={{ padding: 8 }}>
                    {formErr}
                </div>
            )}
            {saved && !formErr && (
                <div
                    style={{
                        padding: 8,
                        border: '1px solid var(--gold)',
                        background: 'var(--gold-glow)',
                        color: 'var(--gold)',
                        fontFamily: 'var(--font-display)',
                        fontSize: 11,
                        letterSpacing: 'var(--track-wide)',
                    }}
                >
                    SAVED.
                </div>
            )}

            <button type="submit" disabled={!canSubmit} className="admin-form-btn">
                {pending ? 'SAVING…' : 'SAVE CHANGES'}
            </button>
        </form>
    );
}
