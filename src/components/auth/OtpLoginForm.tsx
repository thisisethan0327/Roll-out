'use client';
/**
 * Shared email-OTP login form used by both /admin/login and /shop/login.
 *
 * Two phases: enter email → enter 6-digit code. Pre-checks the Supabase env
 * config so a missing `NEXT_PUBLIC_*` deploy var surfaces an explicit error
 * instead of a stuck spinner. emailRedirectTo carries the tenant signal to
 * the send-auth-email Auth Hook (anything containing rollout.club routes to
 * the Rollout branding).
 */
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser, isSupabaseConfigured } from '@/lib/supabase/browser';

type Phase = 'email' | 'otp';

export type OtpLoginFormProps = {
    /** Where to push after a successful OTP verify. Server gate at the
     *  destination should re-verify the role and bounce if mismatched. */
    successPath: string;
    /** Path appended to current origin for the emailRedirectTo magic-link
     *  fallback (also serves as the tenant signal for the Auth Hook). */
    redirectSuffix: string;
    /** When true, a brand-new email creates an auth user (consumer sign-up).
     *  Defaults to false so the shop/admin gates stay invite-only — those
     *  callers must omit this prop and keep their existing behavior. */
    allowSignup?: boolean;
};

export function OtpLoginForm({ successPath, redirectSuffix, allowSignup = false }: OtpLoginFormProps) {
    const router = useRouter();
    const [phase, setPhase] = useState<Phase>('email');
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [resendIn, setResendIn] = useState(0);
    const otpInputRef = useRef<HTMLInputElement>(null);
    // Guards against a double verify when the auto-submit (6th digit) and a
    // manual button press or Enter land in the same tick.
    const verifyingRef = useRef(false);

    const startResendCooldown = () => {
        setResendIn(30);
        const id = setInterval(() => {
            setResendIn((s) => {
                if (s <= 1) {
                    clearInterval(id);
                    return 0;
                }
                return s - 1;
            });
        }, 1000);
    };

    if (!isSupabaseConfigured()) {
        return (
            <div className="admin-login-error" style={{ whiteSpace: 'pre-wrap' }}>
                Deploy config missing. Set
                {'\n  '}NEXT_PUBLIC_SUPABASE_URL
                {'\n  '}NEXT_PUBLIC_SUPABASE_ANON_KEY
                {'\n'}as BUILD-TIME variables in Coolify, then redeploy.
            </div>
        );
    }

    const sendCode = async (e?: React.FormEvent) => {
        e?.preventDefault();
        setErr(null);
        if (!email.trim()) return;
        setBusy(true);
        try {
            const supabase = getSupabaseBrowser();
            const origin =
                typeof window !== 'undefined' ? window.location.origin : 'https://rollout.club';
            const { error } = await supabase.auth.signInWithOtp({
                email: email.trim().toLowerCase(),
                options: {
                    shouldCreateUser: allowSignup,
                    emailRedirectTo: `${origin}${redirectSuffix}`,
                    // SECURITY: consumer sign-ups MUST carry app='rollout' in
                    // raw_user_meta_data. Without it a legacy public.* trigger
                    // auto-provisions the new auth user as an EMWRAPS STAFF
                    // profile (public.profiles) — a cross-tenant privilege leak.
                    // options.data is only consumed when a user is created, so
                    // this is inert for existing users and for the shop/admin
                    // gates (allowSignup=false → shouldCreateUser=false).
                    ...(allowSignup ? { data: { app: 'rollout' } } : {}),
                },
            });
            if (error) {
                setErr(error.message);
                return;
            }
            setPhase('otp');
            startResendCooldown();
        } catch (ex: any) {
            setErr(ex?.message ?? 'Unexpected error sending code.');
        } finally {
            setBusy(false);
        }
    };

    // Verify a 6-digit code. Called both by the auto-submit on the 6th digit
    // and by the manual VERIFY button / Enter (kept as a fallback). The ref
    // guard prevents a double call when both fire together.
    const runVerify = async (code: string) => {
        const token = code.trim();
        if (token.length !== 6) return;
        if (verifyingRef.current) return;
        verifyingRef.current = true;
        setErr(null);
        setBusy(true);
        try {
            const supabase = getSupabaseBrowser();
            const { error } = await supabase.auth.verifyOtp({
                email: email.trim().toLowerCase(),
                token,
                type: 'email',
            });
            if (error) {
                // Failure: wipe the entry and refocus so a retype starts clean.
                setErr(error.message);
                setOtp('');
                requestAnimationFrame(() => otpInputRef.current?.focus());
                return;
            }
            router.push(successPath);
            router.refresh();
        } catch (ex: any) {
            setErr(ex?.message ?? 'Unexpected error verifying code.');
            setOtp('');
            requestAnimationFrame(() => otpInputRef.current?.focus());
        } finally {
            setBusy(false);
            verifyingRef.current = false;
        }
    };

    const verify = async (e: React.FormEvent) => {
        e.preventDefault();
        await runVerify(otp);
    };

    // Numeric-only, capped at 6. Auto-submits the instant the 6th digit lands
    // (covers both typing and paste-of-6) — no button press needed.
    const handleOtpChange = (raw: string) => {
        const next = raw.replace(/\D/g, '').slice(0, 6);
        setOtp(next);
        if (err) setErr(null);
        if (next.length === 6) {
            void runVerify(next);
        }
    };

    if (phase === 'email') {
        return (
            <form onSubmit={sendCode} className="admin-login-form">
                <label className="admin-login-label">EMAIL</label>
                <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@rollout.club"
                    className="admin-login-input"
                    required
                />
                {err && <div className="admin-login-error">{err}</div>}
                <button type="submit" disabled={busy} className="admin-login-btn">
                    {busy ? 'SENDING...' : 'SEND CODE ›'}
                </button>
            </form>
        );
    }

    return (
        <form onSubmit={verify} className="admin-login-form">
            <label className="admin-login-label">CODE FROM EMAIL</label>
            <input
                ref={otpInputRef}
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) => handleOtpChange(e.target.value)}
                placeholder="000000"
                className="admin-login-input admin-login-otp"
                maxLength={6}
                disabled={busy}
                autoFocus
                required
            />
            <div style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: 'var(--track-wider)' }}>
                SENT TO <span style={{ color: 'var(--gold)' }}>{email.toUpperCase()}</span>
            </div>
            {err && <div className="admin-login-error">{err}</div>}
            <button type="submit" disabled={busy || otp.length !== 6} className="admin-login-btn">
                {busy ? 'VERIFYING...' : 'VERIFY ›'}
            </button>
            <button
                type="button"
                disabled={busy || resendIn > 0}
                onClick={() => {
                    setOtp('');
                    setErr(null);
                    void sendCode();
                }}
                className="admin-login-secondary"
            >
                {resendIn > 0 ? `RESEND CODE IN ${resendIn}s` : 'RESEND CODE'}
            </button>
            <button
                type="button"
                onClick={() => {
                    setPhase('email');
                    setOtp('');
                    setErr(null);
                }}
                className="admin-login-secondary"
            >
                ← USE DIFFERENT EMAIL
            </button>
        </form>
    );
}
