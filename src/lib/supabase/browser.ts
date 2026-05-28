/**
 * Supabase browser client — runs in Client Components. The only place where
 * we hand the user the OTP flow (verifyOtp), since OTP requires browser-side
 * cookie storage of the resulting session.
 */
'use client';
import { createBrowserClient } from '@supabase/ssr';

export function getSupabaseBrowser() {
    return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
}
