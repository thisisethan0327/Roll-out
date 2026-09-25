/**
 * GET /api/app/event-checkout/config — the mobile app's PaymentSheet setup
 * data. See docs/IN_APP_PAYMENT_PLAN_2026-09-25.md's "API contract".
 *
 * Auth: `Authorization: Bearer <Supabase access token>`, verified server-side
 * (resolveAppCaller) like every other route in this lane — the response
 * carries nothing member-specific, but a signed-out caller has no business
 * priming a payment sheet either.
 */
import { NextRequest, NextResponse } from 'next/server';
import { bearerTokenFrom, resolveAppCaller } from '@/lib/app-auth';
import { STRIPE_PUBLISHABLE_KEY } from '@/lib/medusa';
import { multiTicketsEnabled } from '@/lib/event-tickets';

export async function GET(req: NextRequest) {
    const caller = await resolveAppCaller(bearerTokenFrom(req));
    if (!caller) {
        return NextResponse.json({ ok: false, error: 'Sign in required.', code: 'auth' }, { status: 401 });
    }

    if (!STRIPE_PUBLISHABLE_KEY) {
        // Same loud guard as the web checkout page — never silently point the
        // app at a test key.
        return NextResponse.json(
            { ok: false, error: 'Payments are not configured.' },
            { status: 200 },
        );
    }

    return NextResponse.json({
        ok: true,
        publishableKey: STRIPE_PUBLISHABLE_KEY,
        merchantDisplayName: 'Rollout',
        country: 'US',
        multiTicketsEnabled: await multiTicketsEnabled(),
    });
}
