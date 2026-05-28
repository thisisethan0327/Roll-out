/**
 * Refreshes the Supabase auth cookie on every request so Server Components
 * always see a valid session. Required for SSR auth with @supabase/ssr.
 *
 * Only runs on /admin/* and /shop/* (the auth-gated trees). The marketing
 * site stays cookie-free.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
    let response = NextResponse.next({ request });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value),
                    );
                    response = NextResponse.next({ request });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options),
                    );
                },
            },
        },
    );

    // Touch getUser to trigger token refresh if the access token expired.
    await supabase.auth.getUser();

    return response;
}

export const config = {
    matcher: ['/admin/:path*', '/shop/:path*'],
};
