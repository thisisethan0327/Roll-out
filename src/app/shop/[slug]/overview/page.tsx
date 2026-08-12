import Link from 'next/link';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
    enabledModules,
    ModuleKey,
    type ModuleOverrides,
} from '@/lib/shop-modules';
import { getShopVendorBySlug } from '@/lib/store-shops';
import { countPaidUnfulfilledOrders } from '@/lib/medusa-admin';
import { fetchCatalogByHandles } from '@/lib/medusa';
import { DismissButton } from './DismissButton';

// Orders count is derived live from Medusa on every load — never cache the page.
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Overview' };

type ActionItem = {
    id: string;
    kind: string;
    title: string;
    body: string | null;
    href: string | null;
    created_at: string;
};

async function loadOverview(shopId: number) {
    const admin = getSupabaseAdmin();
    const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();

    // Fan out the counts. All RLS-bypassed via service role since we've
    // already verified shop membership at the layout.
    const [
        pendingRes,
        acceptedRes,
        declinedRes,
        staffRes,
        postsWkRes,
        shopPageRes,
        recentPending,
    ] = await Promise.all([
        admin
            .from('appointment_requests')
            .select('*', { count: 'exact', head: true })
            .eq('shop_id', shopId)
            .eq('status', 'pending'),
        admin
            .from('appointment_requests')
            .select('*', { count: 'exact', head: true })
            .eq('shop_id', shopId)
            .eq('status', 'accepted'),
        admin
            .from('appointment_requests')
            .select('*', { count: 'exact', head: true })
            .eq('shop_id', shopId)
            .eq('status', 'declined'),
        admin
            .from('shop_memberships')
            .select('*', { count: 'exact', head: true })
            .eq('shop_id', shopId),
        admin
            .from('posts')
            .select('id, shop_id, created_at, deleted_at', { count: 'exact', head: true })
            .eq('shop_id', shopId)
            .is('deleted_at', null)
            .gte('created_at', since7d),
        admin
            .from('profiles')
            .select('id, handle, display_name, is_verified, avatar_url')
            .eq('shop_id', shopId)
            .eq('kind', 'shop_page')
            .maybeSingle(),
        admin
            .from('appointment_requests')
            .select(
                `id, service_type, preferred_at, created_at,
                 requester:profiles!appointment_requests_requester_profile_id_fkey(handle, display_name),
                 vehicle:vehicles(year, make, model)`,
            )
            .eq('shop_id', shopId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(5),
    ]);

    const shopPage = shopPageRes.data as any;
    let followers = 0;
    if (shopPage?.id) {
        const fr = await admin
            .from('follows')
            .select('*', { count: 'exact', head: true })
            .eq('followee_id', shopPage.id);
        followers = fr.count ?? 0;
    }

    return {
        pending: pendingRes.count ?? 0,
        accepted: acceptedRes.count ?? 0,
        declined: declinedRes.count ?? 0,
        staff: staffRes.count ?? 0,
        postsThisWeek: postsWkRes.count ?? 0,
        followers,
        shopPage,
        recentPending: recentPending.data ?? [],
    };
}

/**
 * NEEDS ATTENTION loader — what's waiting on THIS shop right now.
 *
 * DESIGN RULE: derive live states, store only event-type alerts. Orders, paused
 * catalog and pending appointments are DERIVED here on every load; the only
 * STORED rows are audience='shop_owner' action_items (no producers write them
 * yet — the surface just makes future producers free).
 *
 * Every row is TIER-GATED: it appears only when the shop actually has the
 * feeding module (Orders / Products / Inbox). The panel shell itself shows for
 * all tiers; individual rows self-select.
 */
async function loadAttention(
    slug: string,
    shopId: number,
    enabled: Set<ModuleKey>,
    handles: string[],
) {
    const admin = getSupabaseAdmin();

    // ── STORED: open shop_owner alerts for THIS shop (event-type, dismissable) ──
    const { data: storedRaw } = await admin
        .from('action_items')
        .select('id, kind, title, body, href, created_at')
        .eq('audience', 'shop_owner')
        .eq('shop_id', shopId)
        .eq('status', 'open')
        .order('created_at', { ascending: false });
    const stored = (storedRaw ?? []) as ActionItem[];

    // ── DERIVED: paid-but-unfulfilled orders (Medusa-backed selling shops) ──
    // Reuses the vendor-scoped order listing (getShopVendorBySlug + Medusa admin
    // API) — the SAME logic the /orders page uses, never duplicated. Only shops
    // whose Orders module is enabled AND that resolve to a vendor key qualify.
    let unfulfilledOrders = 0;
    if (enabled.has(ModuleKey.Orders)) {
        const resolved = await getShopVendorBySlug(slug);
        if (resolved) {
            const { count } = await countPaidUnfulfilledOrders(resolved.vendorKey);
            unfulfilledOrders = count;
        }
    }

    // ── DERIVED: paused catalog (every published product metadata.paused) ──
    // NeferStock's coming-soon gate pauses the whole catalog → hidden from the
    // store. Only checked for Medusa-backed shops with the Products module.
    let catalogPaused = false;
    if (enabled.has(ModuleKey.Products) && handles.length > 0) {
        const { products } = await fetchCatalogByHandles(handles);
        catalogPaused = products.length > 0 && products.every((p) => p.paused);
    }

    // ── DERIVED: pending appointment requests — gated on the Inbox module ──
    // (that's the surface that actions them; the count itself comes from
    // loadOverview's `pending`). Non-Inbox tiers never see this row.
    const showAppointments = enabled.has(ModuleKey.Inbox);

    return { stored, unfulfilledOrders, catalogPaused, showAppointments };
}

function timeAgo(iso: string): string {
    const then = new Date(iso).getTime();
    const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(months / 12)}y ago`;
}

const SERVICE_LABEL: Record<string, string> = {
    WRAP: 'VINYL WRAP',
    PPF: 'PPF',
    TINT: 'WINDOW TINT',
    CERAMIC: 'CERAMIC',
    PARTS: 'PARTS / INSTALL',
    OTHER: 'OTHER',
};

export default async function ShopOverviewPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const { shop } = await requireShopMemberBySlug(slug);

    // One shop-row read drives the module gate + the paused-catalog handles.
    const admin = getSupabaseAdmin();
    const { data: shopRow } = await admin
        .from('shops')
        .select('commerce_tier, module_overrides, medusa_category_handles')
        .eq('id', shop.shopId)
        .maybeSingle();
    const enabled = enabledModules(
        (shopRow as any)?.commerce_tier,
        ((shopRow as any)?.module_overrides ?? {}) as ModuleOverrides,
    );
    const handles: string[] = Array.isArray((shopRow as any)?.medusa_category_handles)
        ? (shopRow as any).medusa_category_handles
        : [];

    const [s, attn] = await Promise.all([
        loadOverview(shop.shopId),
        loadAttention(slug, shop.shopId, enabled, handles),
    ]);

    const showApptRow = attn.showAppointments && s.pending > 0;
    const attentionCount =
        attn.stored.length +
        (attn.unfulfilledOrders > 0 ? 1 : 0) +
        (attn.catalogPaused ? 1 : 0) +
        (showApptRow ? 1 : 0);

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">OVERVIEW</div>
                    <div className="admin-page-sub">
                        {shop.name.toUpperCase()} · DAILY PULSE
                    </div>
                </div>
                <Link href={`/shop/${slug}/inbox`} className="admin-action-btn" style={{ textDecoration: 'none' }}>
                    OPEN INBOX ›
                </Link>
            </div>

            {/* ── NEEDS ATTENTION — derived live signals + stored shop_owner alerts ── */}
            <div className="admin-page-head" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 12 }}>
                <div>
                    <div className="admin-page-title" style={{ fontSize: 14 }}>
                        NEEDS ATTENTION
                        {attentionCount > 0 && (
                            <span className="admin-pill warn" style={{ marginLeft: 10, verticalAlign: 'middle' }}>
                                {attentionCount}
                            </span>
                        )}
                    </div>
                    <div className="admin-page-sub">WHAT&apos;S WAITING ON THIS SHOP</div>
                </div>
            </div>

            {attn.unfulfilledOrders > 0 && (
                <Link href={`/shop/${slug}/orders`} className="admin-attention-derived">
                    <span className="admin-pill gold">{attn.unfulfilledOrders}</span>
                    <span>
                        paid order{attn.unfulfilledOrders === 1 ? '' : 's'} awaiting fulfillment —
                        pack &amp; ship ›
                    </span>
                </Link>
            )}

            {attn.catalogPaused && (
                <Link href={`/shop/${slug}/products`} className="admin-attention-derived">
                    <span className="admin-pill warn">PAUSED</span>
                    <span>CATALOG PAUSED — products hidden from the store ›</span>
                </Link>
            )}

            {showApptRow && (
                <Link href={`/shop/${slug}/inbox`} className="admin-attention-derived">
                    <span className="admin-pill gold">{s.pending}</span>
                    <span>
                        pending appointment request{s.pending === 1 ? '' : 's'} — review now ›
                    </span>
                </Link>
            )}

            {attentionCount === 0 ? (
                <div className="admin-empty" style={{ marginBottom: 28 }}>
                    ALL CLEAR — NOTHING NEEDS ATTENTION
                </div>
            ) : attn.stored.length === 0 ? (
                <div style={{ marginBottom: 28 }} />
            ) : (
                <div className="admin-attention-list">
                    {attn.stored.map((item) => (
                        <div key={item.id} className="admin-attention-item">
                            <div className="admin-attention-body">
                                <div className="admin-attention-title">
                                    {item.href ? (
                                        <Link href={item.href} className="text-link">
                                            {item.title}
                                        </Link>
                                    ) : (
                                        item.title
                                    )}
                                </div>
                                {item.body && (
                                    <div className="admin-attention-desc">{item.body}</div>
                                )}
                                <div className="admin-attention-meta">
                                    {item.kind.toUpperCase().replace(/_/g, ' ')} · {timeAgo(item.created_at)}
                                </div>
                            </div>
                            <div className="admin-attention-actions">
                                {item.href && (
                                    <Link href={item.href} className="admin-action-btn">
                                        OPEN ›
                                    </Link>
                                )}
                                <DismissButton slug={slug} id={item.id} />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="admin-stat-grid">
                <Stat label="PENDING REQUESTS" value={s.pending} accent={s.pending > 0 ? 'gold' : undefined} />
                <Stat label="ACCEPTED" value={s.accepted} />
                <Stat label="DECLINED / CANCELLED" value={s.declined} />
                <Stat label="STAFF" value={s.staff} />
                <Stat label="POSTS / 7D" value={s.postsThisWeek} />
                <Stat label="FOLLOWERS" value={s.followers} />
            </div>

            <div className="admin-page-head" style={{ marginTop: 12, borderBottom: 'none', paddingBottom: 0 }}>
                <div>
                    <div className="admin-page-title" style={{ fontSize: 14 }}>
                        PRIORITY QUEUE
                    </div>
                    <div className="admin-page-sub">5 MOST RECENT PENDING REQUESTS</div>
                </div>
            </div>

            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>WHEN</th>
                            <th>CUSTOMER</th>
                            <th>SERVICE</th>
                            <th>VEHICLE</th>
                            <th>PREFERRED</th>
                            <th style={{ textAlign: 'right' }}>ACTION</th>
                        </tr>
                    </thead>
                    <tbody>
                        {s.recentPending.length === 0 ? (
                            <tr>
                                <td colSpan={6}>
                                    <div className="admin-empty">
                                        NO PENDING REQUESTS — EVERYTHING&apos;S CAUGHT UP.
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            s.recentPending.map((a: any) => (
                                <tr key={a.id}>
                                    <td>
                                        {new Date(a.created_at).toISOString().slice(0, 16).replace('T', ' ')}
                                    </td>
                                    <td>
                                        @{a.requester?.handle ?? '?'}
                                        <div className="admin-handle">{a.requester?.display_name}</div>
                                    </td>
                                    <td>
                                        <span className="admin-pill">
                                            {SERVICE_LABEL[a.service_type] ?? a.service_type}
                                        </span>
                                    </td>
                                    <td>
                                        {a.vehicle
                                            ? `${a.vehicle.year ?? ''} ${a.vehicle.make ?? ''} ${a.vehicle.model ?? ''}`.trim()
                                            : '—'}
                                    </td>
                                    <td>{a.preferred_at ?? '—'}</td>
                                    <td style={{ textAlign: 'right' }}>
                                        <Link
                                            href={`/shop/${slug}/inbox`}
                                            className="admin-action-btn"
                                            style={{ textDecoration: 'none' }}
                                        >
                                            REVIEW ›
                                        </Link>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {!s.shopPage?.is_verified && (
                <div
                    style={{
                        marginTop: 20,
                        padding: 14,
                        border: '1px solid var(--gold)',
                        background: 'var(--gold-glow)',
                        fontFamily: 'var(--font-display)',
                        fontSize: 11,
                        letterSpacing: 'var(--track-wide)',
                        color: 'var(--text-2)',
                    }}
                >
                    <strong style={{ color: 'var(--gold)' }}>VERIFICATION PENDING</strong> — your shop_page profile
                    isn&apos;t marked verified yet. Customers booking through Rollout will see a yellow note instead of
                    the ✓ badge. Reach out to{' '}
                    <a href="mailto:team@rollout.club" style={{ color: 'var(--gold)' }}>team@rollout.club</a> when
                    you&apos;re ready.
                </div>
            )}
        </>
    );
}

function Stat({
    label,
    value,
    accent,
}: {
    label: string;
    value: number | string;
    accent?: 'gold' | 'warn';
}) {
    return (
        <div className="admin-stat">
            <div className="admin-stat-lbl">{label}</div>
            <div className={`admin-stat-num ${accent ?? ''}`}>{value}</div>
        </div>
    );
}
