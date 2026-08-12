/**
 * ATTENTION SWEEP — API-based producers (Console Phase C1 · D5).
 *
 * The DB-derivable producers (verification SLA, email failures, overdue
 * invoices, aging appointments) run as SQL inside rollout.run_attention_sweep()
 * (migration 20260812_048). The two producers that need to call external HTTP
 * APIs live HERE instead of a Deno edge function, so they can reuse the existing
 * server-only clients natively:
 *
 *   • Coolify deploy failures  — polls the Coolify API for failed deployments.
 *   • Medusa order aging       — reuses listVendorOrders / isPaidUnfulfilled from
 *                                src/lib/medusa-admin.ts (the SAME vendor-scoped
 *                                logic the shop Orders page uses, never dup'd).
 *
 * Invocation: rollout.run_attention_sweep() fires a single net.http_post to this
 * route at the end of each 15-minute sweep, authorized with a shared secret from
 * Supabase Vault (attention_sweep_secret) that must match ATTENTION_SWEEP_SECRET
 * in this app's env. No secret → 401 (and the DB producers are unaffected).
 *
 * Every producer is idempotent (upsertActionItem dedupes on the open partial
 * index) and auto-resolving (resolveActionItemsNotIn clears items whose feeding
 * condition cleared). SEED/TEST shops (slug 'seed-%', KYC test shop id 15) are
 * excluded so only real signal reaches the console.
 */
import 'server-only';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
    upsertActionItem,
    resolveActionItemsNotIn,
} from '@/lib/action-items';
import { getSellingShops, resolveShopVendorKey } from '@/lib/store-shops';
import { listVendorOrders, isPaidUnfulfilled } from '@/lib/medusa-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ORDER_AGING_MS = 48 * 60 * 60 * 1000; // paid-but-unfulfilled older than 48h
const SEED_SLUG_PREFIX = 'seed-';
const KYC_TEST_SHOP_ID = 15;

type Summary = {
    ok: boolean;
    coolify: { checked: boolean; failed: number; note?: string };
    medusa: { checked: boolean; shopsWithAging: number; note?: string };
};

/** Constant-time-ish bearer check against ATTENTION_SWEEP_SECRET. */
function authorized(req: Request): boolean {
    const secret = process.env.ATTENTION_SWEEP_SECRET;
    if (!secret) return false;
    const auth = req.headers.get('authorization') ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    return token.length > 0 && token === secret;
}

// ── PRODUCER: Coolify deploy failures ────────────────────────────────────────
// Raises a platform_admin item per app whose LATEST deployment failed; resolves
// the moment a later deployment for that app succeeds. Best-effort: unreachable
// Coolify / missing token → skip WITHOUT resolving (never wrongly clears items).
async function sweepCoolify(admin: ReturnType<typeof getSupabaseAdmin>): Promise<Summary['coolify']> {
    const token = process.env.COOLIFY_API_TOKEN;
    const base = process.env.COOLIFY_API_BASE ?? 'https://coolify.neferstock.com/api/v1';
    if (!token) return { checked: false, failed: 0, note: 'COOLIFY_API_TOKEN unset — skipped' };

    let deployments: any[] = [];
    try {
        const res = await fetch(`${base}/deployments`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            cache: 'no-store',
        });
        if (!res.ok) return { checked: false, failed: 0, note: `Coolify responded ${res.status}` };
        const json = await res.json();
        deployments = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
    } catch (e: any) {
        return { checked: false, failed: 0, note: `Coolify fetch failed: ${e?.message ?? e}` };
    }

    // Latest deployment per application; a failed latest → an open alert.
    const appOf = (d: any) =>
        String(d?.application_uuid ?? d?.application_id ?? d?.application_name ?? d?.app_id ?? 'unknown');
    const commitOf = (d: any) => String(d?.commit ?? d?.commit_sha ?? d?.commit_message ?? 'unknown').slice(0, 12);
    const tsOf = (d: any) => Date.parse(d?.finished_at ?? d?.updated_at ?? d?.created_at ?? '') || 0;
    const isFailed = (s: any) =>
        ['failed', 'error', 'cancelled-by-error', 'cancelled_by_error'].includes(String(s ?? '').toLowerCase());

    const latestPerApp = new Map<string, any>();
    for (const d of deployments) {
        const app = appOf(d);
        const prev = latestPerApp.get(app);
        if (!prev || tsOf(d) >= tsOf(prev)) latestPerApp.set(app, d);
    }

    const liveKeys: string[] = [];
    for (const [app, d] of latestPerApp) {
        if (!isFailed(d?.status ?? d?.state)) continue;
        const commit = commitOf(d);
        const key = `deploy_failed:${app}:${commit}`;
        liveKeys.push(key);
        const name = String(d?.application_name ?? app);
        await upsertActionItem(admin, {
            app: 'rollout',
            audience: 'platform_admin',
            kind: 'deploy_failed',
            title: `DEPLOY FAILED — ${name}`,
            body: `The latest Coolify deployment of ${name} (commit ${commit}) failed. Check the Coolify deploy log and redeploy.`,
            href: null,
            dedupeKey: key,
        });
    }
    // Resolve any prior deploy_failed whose app has since deployed successfully.
    await resolveActionItemsNotIn(admin, 'deploy_failed', liveKeys);
    return { checked: true, failed: liveKeys.length };
}

// ── PRODUCER: Medusa order aging ─────────────────────────────────────────────
// One shop_owner item per selling shop with paid-but-unfulfilled orders older
// than 48h. Reuses the vendor-scoped Medusa admin client; resolves at zero.
async function sweepMedusa(admin: ReturnType<typeof getSupabaseAdmin>): Promise<Summary['medusa']> {
    let shops;
    try {
        shops = await getSellingShops();
    } catch (e: any) {
        return { checked: false, shopsWithAging: 0, note: `selling shops load failed: ${e?.message ?? e}` };
    }

    const cutoff = Date.now() - ORDER_AGING_MS;
    const liveKeys: string[] = [];
    let hadError = false;

    for (const shop of shops) {
        // Belt-and-suspenders seed exclusion (getSellingShops already filters).
        if (shop.slug.startsWith(SEED_SLUG_PREFIX) || shop.shopId === KYC_TEST_SHOP_ID) continue;
        const vendorKey = resolveShopVendorKey(shop);
        if (!vendorKey) continue; // no Medusa catalog → no Orders

        const { orders, error } = await listVendorOrders(vendorKey);
        if (error) {
            hadError = true;
            continue; // don't resolve on a transient Medusa error
        }
        const aging = orders.filter(
            (o) => isPaidUnfulfilled(o) && o.created_at != null && Date.parse(o.created_at) < cutoff,
        );
        if (aging.length === 0) continue;

        const key = `orders_aging:${shop.shopId}`;
        liveKeys.push(key);
        await upsertActionItem(admin, {
            app: 'neferstock',
            audience: 'shop_owner',
            shopId: shop.shopId,
            kind: 'orders_aging',
            title: `ORDERS AWAITING FULFILLMENT — ${aging.length} over 48h`,
            body: `${shop.name} has ${aging.length} paid order(s) unfulfilled for more than 48h. Pack & ship them.`,
            href: `/shop/${shop.slug}/orders`,
            dedupeKey: key,
        });
    }

    // Only auto-resolve when we had a clean read (a Medusa outage must not clear
    // genuine open items). liveKeys is the set still aging this sweep.
    if (!hadError) await resolveActionItemsNotIn(admin, 'orders_aging', liveKeys);
    return { checked: !hadError, shopsWithAging: liveKeys.length, note: hadError ? 'partial (Medusa error)' : undefined };
}

async function runSweep(): Promise<Summary> {
    const admin = getSupabaseAdmin();
    const [coolify, medusa] = await Promise.all([sweepCoolify(admin), sweepMedusa(admin)]);
    return { ok: true, coolify, medusa };
}

export async function POST(req: Request) {
    if (!authorized(req)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const summary = await runSweep();
    return NextResponse.json(summary);
}

// Allow manual GET invocation with the same bearer for debugging.
export async function GET(req: Request) {
    if (!authorized(req)) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const summary = await runSweep();
    return NextResponse.json(summary);
}
