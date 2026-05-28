'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser, isSupabaseConfigured } from '@/lib/supabase/browser';

type Phase = 'email' | 'otp';

export function LoginForm() {
    const router = useRouter();
    const [phase, setPhase] = useState<Phase>('email');
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    // If the deploy is missing NEXT_PUBLIC_* vars, render a clear deploy-config
    // error instead of the form. Otherwise the user gets a stuck spinner.
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

    const sendCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setErr(null);
        if (!email.trim()) return;
        setBusy(true);
        try {
            const supabase = getSupabaseBrowser();
            // emailRedirectTo doubles as the tenant discriminator for the
            // send-auth-email Auth Hook (rollout.club triggers Rollout
            // branding; without it, the hook falls back to site_url which is
            // app.emwraps.net → EMWRAPS branding). Falls back to the page's
            // own origin during local dev (localhost:3001 is on the
            // allowlist).
            const origin =
                typeof window !== 'undefined' ? window.location.origin : 'https://rollout.club';
            const { error } = await supabase.auth.signInWithOtp({
                email: email.trim().toLowerCase(),
                options: {
                    shouldCreateUser: false,
                    emailRedirectTo: `${origin}/admin/login`,
                },
            });
            if (error) {
                setErr(error.message);
                return;
            }
            setPhase('otp');
        } catch (ex: any) {
            setErr(ex?.message ?? 'Unexpected error sending code.');
        } finally {
            setBusy(false);
        }
    };

    const verify = async (e: React.FormEvent) => {
        e.preventDefault();
        setErr(null);
        if (otp.trim().length !== 6) return;
        setBusy(true);
        try {
            const supabase = getSupabaseBrowser();
            const { error } = await supabase.auth.verifyOtp({
                email: email.trim().toLowerCase(),
                token: otp.trim(),
                type: 'email',
            });
            if (error) {
                setErr(error.message);
                return;
            }
            // Server-side guard on /admin/overview will reject non-admin users.
            router.push('/admin/overview');
            router.refresh();
        } catch (ex: any) {
            setErr(ex?.message ?? 'Unexpected error verifying code.');
        } finally {
            setBusy(false);
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
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="admin-login-input admin-login-otp"
                maxLength={6}
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
