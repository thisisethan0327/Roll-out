/**
 * Action-items helpers — the persistent "needs attention" spine.
 *
 * All writes go through the service-role admin client (RLS on the table is
 * locked to platform admins; service role bypasses it). Every helper here is
 * BEST-EFFORT and failure-tolerant: a raise/resolve must never block or throw
 * out of the caller's happy path (a shop approval, an owner saving settings).
 * Errors are logged and swallowed.
 *
 * Dedupe is enforced at the DB layer by a partial unique index on dedupe_key
 * WHERE status='open', so re-raising the same open alert is a no-op even under
 * a race. We still check-then-insert to avoid a noisy unique-violation log on
 * the common already-open path.
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

type AdminClient = SupabaseClient<any, any, any>;

export function shopUnmappedKey(shopId: number): string {
    return `shop_unmapped:${shopId}`;
}

/**
 * Raise (or leave untouched) a shop_unmapped alert for a shop that should be on
 * the map but has no coordinates. `addressText` is the address we tried to
 * geocode, or null when there's nothing on file.
 */
export async function raiseShopUnmapped(
    admin: AdminClient,
    shopId: number,
    shopName: string | null | undefined,
    addressText: string | null,
): Promise<void> {
    try {
        const dedupe_key = shopUnmappedKey(shopId);
        // No-op if an open one already exists (dedupe slot occupied).
        const { data: existing } = await admin
            .from('action_items')
            .select('id')
            .eq('dedupe_key', dedupe_key)
            .eq('status', 'open')
            .maybeSingle();
        if (existing) return;

        const name = (shopName ?? '').trim() || `shop #${shopId}`;
        const body = addressText
            ? `Geocoding could not resolve coordinates for: ${addressText}. Add or correct the address so it can be pinned on the map.`
            : 'No address on file — add a street address, then it can be pinned on the map.';

        await admin.from('action_items').insert({
            audience: 'platform_admin',
            shop_id: shopId,
            kind: 'shop_unmapped',
            title: `SHOP APPROVED BUT NOT ON MAP — ${name}`,
            body,
            href: '/admin/shops',
            dedupe_key,
        });
    } catch (e) {
        console.error('[action-items] raiseShopUnmapped failed (non-fatal):', e);
    }
}

/**
 * Resolve any OPEN shop_unmapped alert for a shop — called when coordinates
 * appear (geocode retry success, or an owner/admin edits the shop lat/lng).
 */
export async function resolveShopUnmapped(
    admin: AdminClient,
    shopId: number,
): Promise<void> {
    try {
        await admin
            .from('action_items')
            .update({ status: 'resolved', resolved_at: new Date().toISOString() })
            .eq('dedupe_key', shopUnmappedKey(shopId))
            .eq('status', 'open');
    } catch (e) {
        console.error('[action-items] resolveShopUnmapped failed (non-fatal):', e);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic producer helpers — used by the sweep route (/api/cron/attention-sweep)
// for the API-based producers (Coolify deploy failures, Medusa order aging) that
// can't be expressed as a pure DB query. Same contract as above: best-effort,
// dedupe-safe (partial-unique index on dedupe_key WHERE status='open'), and
// AUTO-RESOLVING (resolveActionItemsNotIn clears items whose condition cleared).
// The DB-derivable producers live in SQL (migration 20260812_048).
// ─────────────────────────────────────────────────────────────────────────────

export type ActionItemInput = {
    app: string;
    audience: 'platform_admin' | 'shop_owner';
    shopId?: number | null;
    kind: string;
    title: string;
    body?: string | null;
    href?: string | null;
    dedupeKey: string;
};

/**
 * Raise or refresh an open action item keyed by dedupeKey. If an open row for the
 * key exists its title/body/href are refreshed (so an aggregated count stays
 * current); otherwise a new open row is inserted. The insert races safely against
 * the partial-unique index — a concurrent raise collapses to one open row.
 */
export async function upsertActionItem(
    admin: AdminClient,
    item: ActionItemInput,
): Promise<void> {
    try {
        const { data: existing } = await admin
            .from('action_items')
            .select('id')
            .eq('dedupe_key', item.dedupeKey)
            .eq('status', 'open')
            .maybeSingle();

        if (existing) {
            await admin
                .from('action_items')
                .update({ title: item.title, body: item.body ?? null, href: item.href ?? null })
                .eq('id', existing.id);
            return;
        }

        await admin.from('action_items').insert({
            app: item.app,
            audience: item.audience,
            shop_id: item.shopId ?? null,
            kind: item.kind,
            title: item.title,
            body: item.body ?? null,
            href: item.href ?? null,
            dedupe_key: item.dedupeKey,
        });
    } catch (e) {
        console.error(`[action-items] upsertActionItem(${item.dedupeKey}) failed (non-fatal):`, e);
    }
}

/**
 * Auto-resolve: resolve every OPEN item of `kind` whose dedupe_key is NOT in
 * `liveDedupeKeys` — i.e. the underlying condition cleared since it was raised.
 * Pass the exact set of keys the current sweep still considers active.
 */
export async function resolveActionItemsNotIn(
    admin: AdminClient,
    kind: string,
    liveDedupeKeys: string[],
): Promise<void> {
    try {
        let q = admin
            .from('action_items')
            .update({ status: 'resolved', resolved_at: new Date().toISOString() })
            .eq('kind', kind)
            .eq('status', 'open');
        if (liveDedupeKeys.length > 0) {
            // Resolve open items of this kind that are NOT still live.
            q = q.not('dedupe_key', 'in', `(${liveDedupeKeys.map((k) => `"${k}"`).join(',')})`);
        }
        await q;
    } catch (e) {
        console.error(`[action-items] resolveActionItemsNotIn(${kind}) failed (non-fatal):`, e);
    }
}
