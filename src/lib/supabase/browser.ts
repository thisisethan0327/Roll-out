/**
 * Supabase browser client — runs in Client Components. The only place where
 * we hand the user the OTP flow (verifyOtp), since OTP requires browser-side
 * cookie storage of the resulting session.
 */
'use client';
import { createBrowserClient } from '@supabase/ssr';

/**
 * True when both `NEXT_PUBLIC_*` env vars are present in the client bundle.
 * Exported so screens can render a clear "deploy config missing" state
 * instead of letting the Supabase client throw synchronously and leaving
 * the UI stuck mid-action.
 */
export function isSupabaseConfigured() {
    return Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
}

export function getSupabaseBrowser() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
        // Caller should have gated on isSupabaseConfigured(); throw here so
        // if somehow this slips through, the failure is loud and explicit
        // rather than the cryptic supabase-ssr message.
        throw new Error(
            'Supabase client env missing — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY as BUILD-TIME vars and redeploy.',
        );
    }
    return createBrowserClient(url, key);
}
