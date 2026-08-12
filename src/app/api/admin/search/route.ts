/**
 * JUMP search API (Console Phase C3) — backs the console header's debounced
 * search dropdown. Platform-admin only: returns 401 JSON (never a login
 * redirect) so the client fetch can degrade quietly. The heavy lifting lives in
 * `jumpSearch`, shared with the full /admin/search results page.
 */
import 'server-only';
import { NextResponse } from 'next/server';
import { getPlatformAdmin } from '@/lib/auth-guard';
import { jumpSearch } from '@/lib/jump-search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const admin = await getPlatformAdmin();
    if (!admin) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const q = new URL(req.url).searchParams.get('q') ?? '';
    const results = await jumpSearch(q);
    return NextResponse.json(results, {
        headers: { 'cache-control': 'no-store' },
    });
}
