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
