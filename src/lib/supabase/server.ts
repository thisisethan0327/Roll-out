/**
 * Supabase server client — runs inside Server Components, Route Handlers, and
 * Server Actions. Reads/writes session cookies via Next.js' cookies() API so
 * the same logged-in session is visible across SSR + server actions.
 *
 * Uses the public anon key; RLS still applies. Use the admin client (below)
 * when you need to bypass RLS for moderation queries.
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function getSupabaseServer() {
    const cookieStore = await cookies();
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) => {
                            cookieStore.set(name, value, options);
                        });
                    } catch {
                        // Server Components can't set cookies. The
                        // middleware refresh handles session persistence.
                    }
                },
            },
        },
    );
}
