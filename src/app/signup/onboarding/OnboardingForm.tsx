'use client';
/**
 * Onboarding form (client), in the order a person actually thinks: DISPLAY
 * NAME first; the @HANDLE fills itself from the name (a slug — lowercase,
 * letters/digits/underscores — with a numeric suffix when the slug is taken)
 * and keeps the live availability check; the moment the handle is edited by
 * hand it stops following the name. Bio optional. Then an OPTIONAL shipping
 * address, stored on the member's store account so checkout prefills it.
 * Submits via claimProfileAction, which redirects on success.
 */
import { useEffect, useRef, useState, useTransition } from 'react';
import { checkHandleAction, claimProfileAction, type OnboardingAddress } from './actions';
import { PendingButton } from '@/components/feedback';

type HandleState =
    | { kind: 'idle' }
    | { kind: 'checking' }
    | { kind: 'ok' }
    | { kind: 'bad'; reason: string };

/** "Jess O'Neil-Park" → "jess_o_neil_park"; guaranteed to start with a letter, 3–20 chars. */
export function slugFromName(name: string): string {
    let s = name
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_{2,}/g, '_');
    if (s && !/^[a-z]/.test(s)) s = 'u_' + s;
    if (s.length < 3) return '';
    return s.slice(0, 20).replace(/_+$/g, '');
}

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

const EMPTY_ADDRESS: OnboardingAddress = {
    firstName: '',
    lastName: '',
    address1: '',
    address2: '',
    city: '',
    province: '',
    postalCode: '',
    countryCode: 'us',
    phone: '',
};

export function OnboardingForm({
    suggestedName,
    next,
}: {
    suggestedName: string;
    next?: string;
}) {
    const [displayName, setDisplayName] = useState(suggestedName);
    const [handle, setHandle] = useState(() => slugFromName(suggestedName));
    // Until the member edits the handle themselves it follows the name.
    const [handleTouched, setHandleTouched] = useState(false);
    const [bio, setBio] = useState('');
    const [address, setAddress] = useState<OnboardingAddress>(EMPTY_ADDRESS);
    const [handleState, setHandleState] = useState<HandleState>({ kind: 'idle' });
    const [formErr, setFormErr] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const seqRef = useRef(0);
    // Collision suffix for the auto-slug: base_2, base_3 … (auto mode only).
    const suffixRef = useRef(1);

    const onNameChange = (v: string) => {
        setDisplayName(v);
        if (!handleTouched) {
            suffixRef.current = 1;
            setHandle(slugFromName(v));
        }
    };

    // Debounced availability check as the handle changes (typed or auto).
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const normalized = handle.trim().toLowerCase().replace(/^@+/, '');
        if (!normalized) {
            setHandleState({ kind: 'idle' });
            return;
        }
        setHandleState({ kind: 'checking' });
        const mySeq = ++seqRef.current;
        debounceRef.current = setTimeout(async () => {
            const res = await checkHandleAction(normalized);
            if (mySeq !== seqRef.current) return; // stale
            if (res.ok) {
                setHandleState({ kind: 'ok' });
                return;
            }
            const taken = /taken/i.test(res.reason ?? '');
            // Auto mode + taken → try the next suffix (base_2, base_3 … base_9).
            if (!handleTouched && taken && suffixRef.current < 9) {
                suffixRef.current += 1;
                const base = slugFromName(displayName).slice(0, 20 - 2);
                setHandle(`${base}_${suffixRef.current}`);
                return;
            }
            setHandleState({ kind: 'bad', reason: res.reason ?? 'Unavailable.' });
        }, 400);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
        // displayName is read for the suffix base only when the auto slug collides
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [handle, handleTouched]);

    const addressStarted = !!(address.address1 || address.city || address.postalCode);
    const addressComplete = !!(address.firstName && address.lastName && address.address1 && address.city && address.province && address.postalCode);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setFormErr(null);
        if (!displayName.trim()) {
            setFormErr('Enter a display name.');
            return;
        }
        if (handleState.kind === 'bad') {
            setFormErr(handleState.reason);
            return;
        }
        if (addressStarted && !addressComplete) {
            setFormErr('Finish the shipping address (name, street, city, state, ZIP) or clear it.');
            return;
        }
        startTransition(async () => {
            const res = await claimProfileAction({
                handle,
                displayName,
                bio,
                address: addressComplete ? address : null,
                next,
            });
            if (res && !res.ok) setFormErr(res.error); // success redirects
        });
    };

    const hint = (() => {
        switch (handleState.kind) {
            case 'checking':
                return { text: 'CHECKING…', color: 'var(--text-3)' };
            case 'ok':
                return { text: handleTouched ? '✓ AVAILABLE' : '✓ AVAILABLE · FROM YOUR NAME — EDIT IF YOU LIKE', color: 'var(--gold)' };
            case 'bad':
                return { text: handleState.reason.toUpperCase(), color: '#e5484d' };
            default:
                return { text: 'LETTERS, NUMBERS, UNDERSCORES · 3–20 CHARS', color: 'var(--text-3)' };
        }
    })();

    const canSubmit = !pending && handleState.kind === 'ok' && displayName.trim().length > 0 && (!addressStarted || addressComplete);

    const field = (key: keyof OnboardingAddress) => ({
        value: (address[key] ?? '') as string,
        onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setAddress((a) => ({ ...a, [key]: e.target.value })),
        className: 'admin-login-input',
    });

    return (
        <form onSubmit={submit} className="admin-login-form">
            <label className="admin-login-label">DISPLAY NAME</label>
            <input
                type="text"
                value={displayName}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="What people call you"
                className="admin-login-input"
                maxLength={60}
                autoFocus
                required
            />

            <label className="admin-login-label">HANDLE</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono, monospace)' }}>@</span>
                <input
                    type="text"
                    value={handle}
                    onChange={(e) => {
                        setHandleTouched(true);
                        setHandle(e.target.value);
                    }}
                    placeholder="your_handle"
                    className="admin-login-input"
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="off"
                    spellCheck={false}
                    style={{ flex: 1 }}
                    required
                />
            </div>
            <div style={{ fontSize: 10, letterSpacing: 'var(--track-wider)', color: hint.color, fontFamily: 'var(--font-display)', minHeight: 14 }}>
                {hint.text}
            </div>

            <label className="admin-login-label">BIO · OPTIONAL</label>
            <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Your builds, your lane… (optional)"
                className="admin-login-input"
                maxLength={280}
                rows={3}
                style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />

            <div style={{ borderTop: '1px solid var(--line)', marginTop: 8, paddingTop: 16 }}>
                <label className="admin-login-label">SHIPPING ADDRESS · OPTIONAL</label>
                <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 12 }}>
                    Used when you shop on Rollout — you can skip this and add it at checkout.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <input type="text" placeholder="First name" autoComplete="given-name" {...field('firstName')} />
                    <input type="text" placeholder="Last name" autoComplete="family-name" {...field('lastName')} />
                </div>
                <input type="text" placeholder="Street address" autoComplete="address-line1" style={{ marginTop: 10, width: '100%' }} {...field('address1')} />
                <input type="text" placeholder="Apt, suite, unit (optional)" autoComplete="address-line2" style={{ marginTop: 10, width: '100%' }} {...field('address2')} />
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, marginTop: 10 }}>
                    <input type="text" placeholder="City" autoComplete="address-level2" {...field('city')} />
                    <select aria-label="State" autoComplete="address-level1" {...field('province')}>
                        <option value="">State</option>
                        {US_STATES.map((s) => (
                            <option key={s} value={s}>
                                {s}
                            </option>
                        ))}
                    </select>
                    <input type="text" placeholder="ZIP" inputMode="numeric" autoComplete="postal-code" {...field('postalCode')} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                    <select aria-label="Country" autoComplete="country" {...field('countryCode')}>
                        <option value="us">United States</option>
                        <option value="ca">Canada</option>
                    </select>
                    <input type="tel" placeholder="Phone (optional)" autoComplete="tel" {...field('phone')} />
                </div>
            </div>

            {formErr && <div className="admin-login-error">{formErr}</div>}

            <PendingButton type="submit" pending={pending} pendingLabel="SETTING UP" disabled={!canSubmit} className="admin-login-btn">
                ENTER ROLLOUT ›
            </PendingButton>
        </form>
    );
}
