/**
 * POST /api/events/[id]/cancel-refund — mobile app's "Cancel & get a full
 * refund" for a confirmed PAID spot (077). The web app uses the server
 * action (cancelPaidRsvp in event/[id]/actions.ts) directly; this route
 * exists so the Expo app, which has no access to Next.js server actions, can
 * drive the exact same logic over HTTP with its Supabase JWT.
 *
 * Auth: `Authorization: Bearer <supabase access token>`, resolved to a
 * rollout profile via getConsumerProfileFromBearer (server-only). No cookie
 * session is used here.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getConsumerProfileFromBearer } from '@/lib/consumer';
import { cancelPaidRsvpAndRefund } from '@/lib/event-refund';
import { SUSPENDED_CODE, SUSPENDED_MESSAGE, isProfileBanned } from '@/lib/ban';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const { id } = await ctx.params;
    if (!UUID_RE.test(id)) {
        return NextResponse.json({ ok: false, error: 'Invalid event.' }, { status: 400 });
    }

    const auth = req.headers.get('authorization') ?? req.headers.get('Authorization');
    const token = auth?.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : null;
    if (!token) {
        return NextResponse.json({ ok: false, error: 'Missing Authorization bearer token.' }, { status: 401 });
    }

    const profile = await getConsumerProfileFromBearer(token);
    if (!profile) {
        return NextResponse.json({ ok: false, error: 'Sign in required.' }, { status: 401 });
    }
    if (isProfileBanned(profile)) {
        return NextResponse.json({ ok: false, error: SUSPENDED_MESSAGE, code: SUSPENDED_CODE }, { status: 403 });
    }

    const result = await cancelPaidRsvpAndRefund(id, profile.profileId);
    if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 200 });
    }
    return NextResponse.json({ ok: true }, { status: 200 });
}
