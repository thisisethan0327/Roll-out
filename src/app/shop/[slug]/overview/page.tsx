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
import { Bell, CalendarClock, ChevronRight, CircleCheck, CirclePause, Inbox, Package, ShieldCheck } from 'lucide-react';
import { ConsoleHead } from '@/components/glide-console/parts';
import { Counts, EmptyRow, Panel, cx, fmtWhen, initials, shopStyles as sh } from '@/components/glide-shop/parts';

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
    const { data: storedRaw, error: storedError } = await admin
        .from('action_items')
        .select('id, kind, title, body, href, created_at')
        .eq('audience', 'shop_owner')
        .eq('shop_id', shopId)
        .eq('status', 'open')
        .order('created_at', { ascending: false });
    if (storedError) console.error('[shop/overview] action_items load failed:', storedError.message);
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
    WRAP: 'Vinyl wrap',
    PPF: 'PPF',
    TINT: 'Window tint',
    CERAMIC: 'Ceramic',
    PARTS: 'Parts / install',
    OTHER: 'Other',
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
    const { data: shopRow, error: shopRowError } = await admin
        .from('shops')
        .select('commerce_tier, module_overrides, medusa_category_handles')
        .eq('id', shop.shopId)
        .maybeSingle();
    if (shopRowError) console.error('[shop/overview] shop row load failed:', shopRowError.message);
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

    const vehicleOf = (a: any) =>
        a.vehicle ? `${a.vehicle.year ?? ''} ${a.vehicle.make ?? ''} ${a.vehicle.model ?? ''}`.trim() || '—' : '—';

    return (
        <div className={sh.stack}>
            <ConsoleHead
                title="Overview"
                sub={`${shop.name} · what's happening at the shop`}
                actions={
                    <Link href={`/shop/${slug}/inbox`} className={cx('g-sec', sh.sec)}>
                        <Inbox size={18} strokeWidth={2} aria-hidden="true" />
                        Open inbox
                    </Link>
                }
            />

            {/* NEEDS ATTENTION: derived live signals + stored shop_owner alerts */}
            <Panel id="attention" title="Needs attention" sub="What's waiting on this shop" count={attentionCount}>
                {attn.unfulfilledOrders > 0 && (
                    <Link href={`/shop/${slug}/orders`} className={sh.note}>
                        <Package size={20} strokeWidth={2} aria-hidden="true" />
                        <span className={sh.noteText}>
                            {attn.unfulfilledOrders} paid order{attn.unfulfilledOrders === 1 ? '' : 's'} awaiting
                            fulfillment
                            <small>Pack and ship</small>
                        </span>
                        <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
                    </Link>
                )}

                {attn.catalogPaused && (
                    <Link href={`/shop/${slug}/products`} className={sh.note}>
                        <CirclePause size={20} strokeWidth={2} aria-hidden="true" />
                        <span className={sh.noteText}>
                            Catalog paused
                            <small>Products are hidden from the store</small>
                        </span>
                        <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
                    </Link>
                )}

                {showApptRow && (
                    <Link href={`/shop/${slug}/inbox`} className={sh.note}>
                        <CalendarClock size={20} strokeWidth={2} aria-hidden="true" />
                        <span className={sh.noteText}>
                            {s.pending} pending appointment request{s.pending === 1 ? '' : 's'}
                            <small>Review them in the inbox</small>
                        </span>
                        <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
                    </Link>
                )}

                {attentionCount === 0 ? (
                    <div className={sh.note} style={{ boxShadow: 'none', background: 'var(--surface)' }}>
                        <CircleCheck size={20} strokeWidth={2} aria-hidden="true" />
                        <span className={sh.noteText}>All clear. Nothing needs attention.</span>
                    </div>
                ) : null}

                {attn.stored.map((item) => (
                    <div key={item.id} className={sh.note}>
                        <Bell size={20} strokeWidth={2} aria-hidden="true" />
                        <span className={sh.noteText}>
                            {item.href ? (
                                <Link href={item.href} className="text-link" style={{ color: 'var(--ink)' }}>
                                    {item.title}
                                </Link>
                            ) : (
                                item.title
                            )}
                            {item.body ? <small>{item.body}</small> : null}
                            <small>
                                {sentenceCase(item.kind.replace(/_/g, ' '))} · {timeAgo(item.created_at)}
                            </small>
                        </span>
                        <span className={sh.noteActs}>
                            {item.href && (
                                <Link href={item.href} className={cx('g-sec', sh.secSm)}>
                                    Open
                                </Link>
                            )}
                            <DismissButton slug={slug} id={item.id} />
                        </span>
                    </div>
                ))}
            </Panel>

            <Counts
                label="Shop counts"
                items={[
                    { label: 'Pending requests', value: s.pending, dot: s.pending > 0 },
                    { label: 'Accepted', value: s.accepted },
                    { label: 'Declined or cancelled', value: s.declined },
                    { label: 'Staff', value: s.staff },
                    { label: 'Posts, last 7 days', value: s.postsThisWeek },
                    { label: 'Followers', value: s.followers },
                ]}
            />

            <Panel
                id="queue"
                title="Priority queue"
                sub="The 5 most recent pending requests"
                flush
                action={
                    <Link href={`/shop/${slug}/inbox`} className="g-link" style={{ paddingRight: 8 }}>
                        Inbox
                        <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
                    </Link>
                }
            >
                <div className={sh.tblWrap}>
                    <table className={cx(sh.tbl, sh.rowLink)}>
                        <thead>
                            <tr>
                                <th>Customer</th>
                                <th>Service</th>
                                <th>Vehicle</th>
                                <th>Preferred</th>
                                <th>Received</th>
                                <th className={sh.r}>
                                    <span className="g-sr">Review</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {s.recentPending.length === 0 ? (
                                <EmptyRow
                                    colSpan={6}
                                    icon={<CircleCheck size={18} strokeWidth={2} />}
                                    title="No pending requests"
                                    body="Everything is caught up. New booking requests land here first."
                                />
                            ) : (
                                s.recentPending.map((a: any) => (
                                    <tr key={a.id}>
                                        <td>
                                            <span className={sh.cell}>
                                                <span className={sh.av} aria-hidden="true">
                                                    {initials(a.requester?.display_name ?? a.requester?.handle)}
                                                </span>
                                                <span style={{ minWidth: 0 }}>
                                                    <Link href={`/shop/${slug}/inbox`} className={sh.stretch}>
                                                        @{a.requester?.handle ?? '?'}
                                                    </Link>
                                                    <small>{a.requester?.display_name}</small>
                                                </span>
                                            </span>
                                        </td>
                                        <td>
                                            <span className="g-chip">{SERVICE_LABEL[a.service_type] ?? a.service_type}</span>
                                        </td>
                                        <td data-label="Vehicle">{vehicleOf(a)}</td>
                                        <td data-label="Preferred" className={sh.when}>
                                            {a.preferred_at ? fmtWhen(a.preferred_at) : '—'}
                                        </td>
                                        <td data-label="Received" className={cx(sh.when, sh.mHide)}>
                                            {fmtWhen(a.created_at)}
                                        </td>
                                        <td className={cx(sh.r, sh.mHide)}>
                                            <ChevronRight size={18} strokeWidth={2} aria-hidden="true" style={{ color: 'var(--ink-2)' }} />
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Panel>

            {!s.shopPage?.is_verified && (
                <div className={sh.note} role="note">
                    <ShieldCheck size={20} strokeWidth={2} aria-hidden="true" />
                    <span className={sh.noteText}>
                        Verification pending
                        <small>
                            Your shop page isn&apos;t marked verified yet. Customers booking through Rollout see a note
                            instead of the verified badge. Reach out to{' '}
                            <a href="mailto:team@rollout.club" className="text-link">
                                team@rollout.club
                            </a>{' '}
                            when you&apos;re ready.
                        </small>
                    </span>
                </div>
            )}
        </div>
    );
}

function sentenceCase(t: string): string {
    const x = t.trim().toLowerCase();
    return x.charAt(0).toUpperCase() + x.slice(1);
}
