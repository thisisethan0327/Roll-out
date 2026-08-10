/**
 * GET /api/nav-context — auth/context flags for the public <SiteHeader>.
 *
 * Returns { signedIn, displayName, isAdmin, hasShops, cartCount }. Called once
 * on mount by the header client component. Runs at request time (reads the SSR
 * cookie session + cart cookie) and is never cached.
 */
import { NextResponse } from 'next/server';
import { getNavContext } from '@/lib/nav-context';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const ctx = await getNavContext();
        return NextResponse.json(ctx, {
            headers: { 'Cache-Control': 'no-store, max-age=0' },
        });
    } catch {
        return NextResponse.json(
            { signedIn: false, displayName: null, isAdmin: false, hasShops: false, cartCount: 0 },
            { headers: { 'Cache-Control': 'no-store, max-age=0' } },
        );
    }
}
