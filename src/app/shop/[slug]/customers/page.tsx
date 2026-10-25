import Link from 'next/link';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin, getSupabasePublicAdmin } from '@/lib/supabase/admin';
import { ChevronRight, UserPlus, Users } from 'lucide-react';
import { ConsoleHead } from '@/components/glide-console/parts';
import { GlideButton } from '@/components/glide/primitives';
import { Counts, EmptyRow, FilterTabs, Panel, SearchBar, cx, fmtWhen, initials, shopStyles as sh } from '@/components/glide-shop/parts';

export const metadata = { title: 'Customers' };

type Source = 'all' | 'rollout' | 'legacy';

const PAGE_LIMIT = 50;

/**
 * Load both customer surfaces in parallel.
 *
 * Rollout members are anyone with at least one appointment_request at this
 * shop. We resolve the distinct requester profile_ids first, then fetch their
 * profile rows (with an optional name/handle ilike) and finally re-count their
 * appointment_requests at this shop for the badge column.
 *
 * Legacy customers come from public.customers but are scoped to this shop by
 * way of public.tickets.shop_id — there's no shop_id column on the legacy
 * customers table itself.
 */
async function loadCustomers(shopId: number, q: string | undefined, source: Source) {
    const admin = getSupabaseAdmin();
    const pub = getSupabasePublicAdmin();
    const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const needle = (q ?? '').trim();

    const doRollout = source === 'all' || source === 'rollout';
    const doLegacy = source === 'all' || source === 'legacy';

    // -- Rollout side ------------------------------------------------
    // First: distinct requester_profile_ids for this shop.
    const rolloutPromise = (async () => {
        if (!doRollout) {
            return {
                rows: [] as any[],
                totalDistinct: 0,
                newThisWeek: 0,
            };
        }
        const { data: apptRows, error: apptRowsError } = await admin
            .from('appointment_requests')
            .select('requester_profile_id, created_at')
            .eq('shop_id', shopId)
            .limit(5000);
        if (apptRowsError) console.error('[shop/customers] rollout appts load failed:', apptRowsError.message);
        const allIds = Array.from(
            new Set((apptRows ?? []).map((r: any) => r.requester_profile_id).filter(Boolean)),
        ) as string[];

        if (allIds.length === 0) {
            return { rows: [], totalDistinct: 0, newThisWeek: 0 };
        }

        // Pull the profiles, optionally filtered by name/handle.
        let profQ = admin
            .from('profiles')
            .select('id, handle, display_name, location, created_at, kind, avatar_url')
            .in('id', allIds)
            .eq('kind', 'user')
            .order('created_at', { ascending: false });
        if (needle) {
            // No phone/email on rollout.profiles — match on handle+display_name.
            profQ = profQ.or(
                `handle.ilike.%${needle}%,display_name.ilike.%${needle}%`,
            );
        }
        const { data: profiles, error: profilesError } = await profQ.limit(PAGE_LIMIT + 1);
        if (profilesError) console.error('[shop/customers] rollout profiles load failed:', profilesError.message);
        const profRows = (profiles ?? []) as any[];

        // Per-profile appointment count at this shop.
        const counts = new Map<string, number>();
        for (const r of apptRows ?? []) {
            const id = (r as any).requester_profile_id;
            if (!id) continue;
            counts.set(id, (counts.get(id) ?? 0) + 1);
        }

        const newThisWeek = profRows.filter(
            (p) => p.created_at && p.created_at >= since7d,
        ).length;

        return {
            rows: profRows.map((p) => ({
                ...p,
                appt_count: counts.get(p.id) ?? 0,
            })),
            totalDistinct: allIds.length,
            newThisWeek,
        };
    })();

    // -- Legacy side -------------------------------------------------
    const legacyPromise = (async () => {
        if (!doLegacy) {
            return {
                rows: [] as any[],
                totalDistinct: 0,
                newThisWeek: 0,
            };
        }
        // Distinct customer_ids who have tickets at this shop.
        const { data: ticketRows, error: ticketRowsError } = await pub
            .from('tickets')
            .select('customer_id, created_at')
            .eq('shop_id', shopId)
            .not('customer_id', 'is', null)
            .limit(10_000);
        if (ticketRowsError) console.error('[shop/customers] legacy tickets load failed:', ticketRowsError.message);
        const allIds = Array.from(
            new Set((ticketRows ?? []).map((r: any) => r.customer_id).filter(Boolean)),
        ) as string[];

        if (allIds.length === 0) {
            return { rows: [], totalDistinct: 0, newThisWeek: 0 };
        }

        let custQ = pub
            .from('customers')
            .select(
                'id, first_name, last_name, name, email, phone, company, created_at',
            )
            .in('id', allIds)
            .order('created_at', { ascending: false });
        if (needle) {
            custQ = custQ.or(
                `name.ilike.%${needle}%,first_name.ilike.%${needle}%,last_name.ilike.%${needle}%,email.ilike.%${needle}%,phone.ilike.%${needle}%`,
            );
        }
        const { data: customers, error: customersError } = await custQ.limit(PAGE_LIMIT + 1);
        if (customersError) console.error('[shop/customers] legacy customers load failed:', customersError.message);
        const custRows = (customers ?? []) as any[];

        // Tickets per customer at this shop.
        const counts = new Map<string, number>();
        for (const r of ticketRows ?? []) {
            const id = (r as any).customer_id;
            if (!id) continue;
            counts.set(id, (counts.get(id) ?? 0) + 1);
        }

        const newThisWeek = custRows.filter(
            (c) => c.created_at && c.created_at >= since7d,
        ).length;

        return {
            rows: custRows.map((c) => ({
                ...c,
                ticket_count: counts.get(c.id) ?? 0,
            })),
            totalDistinct: allIds.length,
            newThisWeek,
        };
    })();

    const [rollout, legacy] = await Promise.all([rolloutPromise, legacyPromise]);
    return { rollout, legacy };
}

function fmtName(c: any) {
    if (c.name && String(c.name).trim()) return c.name;
    const fn = c.first_name ?? '';
    const ln = c.last_name ?? '';
    const joined = `${fn} ${ln}`.trim();
    return joined || c.email || c.phone || '—';
}

export default async function ShopCustomersPage({
    params,
    searchParams,
}: {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ q?: string; source?: string }>;
}) {
    const { slug } = await params;
    const { q, source } = await searchParams;
    const { shop } = await requireShopMemberBySlug(slug);

    const src: Source =
        source === 'rollout' || source === 'legacy' ? source : 'all';
    const { rollout, legacy } = await loadCustomers(shop.shopId, q, src);

    const total = rollout.totalDistinct + legacy.totalDistinct;
    const newThisWeek = rollout.newThisWeek + legacy.newThisWeek;

    const rolloutHasMore = rollout.rows.length > PAGE_LIMIT;
    const legacyHasMore = legacy.rows.length > PAGE_LIMIT;
    const rolloutVisible = rollout.rows.slice(0, PAGE_LIMIT);
    const legacyVisible = legacy.rows.slice(0, PAGE_LIMIT);

    const showRollout = src === 'all' || src === 'rollout';
    const showLegacy = src === 'all' || src === 'legacy';

    const sourceHref = (value: Source) => {
        const params = new URLSearchParams();
        if (value !== 'all') params.set('source', value);
        if (q) params.set('q', q);
        const qs = params.toString();
        return `/shop/${slug}/customers${qs ? `?${qs}` : ''}`;
    };

    return (
        <div className={sh.stack}>
            <ConsoleHead
                title="Customers"
                sub={shop.name}
                actions={
                    <GlideButton href={`/shop/${slug}/customers/new`} size="sm" icon={<UserPlus size={18} strokeWidth={2} />}>
                        New customer
                    </GlideButton>
                }
            />

            <Counts
                label="Customer counts"
                items={[
                    { label: 'Total', value: total },
                    { label: 'Rollout members', value: rollout.totalDistinct },
                    { label: 'Legacy customers', value: legacy.totalDistinct },
                    { label: 'New, last 7 days', value: newThisWeek, dot: newThisWeek > 0 },
                ]}
            />

            <div className={sh.toolbar}>
                <FilterTabs
                    label="Customer source"
                    items={[
                        { href: sourceHref('all'), label: 'All', active: src === 'all' },
                        { href: sourceHref('rollout'), label: 'Rollout', active: src === 'rollout' },
                        { href: sourceHref('legacy'), label: 'Legacy', active: src === 'legacy' },
                    ]}
                />
                <SearchBar
                    action={`/shop/${slug}/customers`}
                    defaultValue={q ?? ''}
                    label="Search customers"
                    placeholder="Search name, email, phone or handle"
                    hidden={{ source: src }}
                    clearHref={q ? `/shop/${slug}/customers${src !== 'all' ? `?source=${src}` : ''}` : null}
                />
            </div>

            {showRollout && (
                <Panel
                    id="rollout-members"
                    title="Rollout members"
                    sub={`${rolloutVisible.length} shown · ${rollout.totalDistinct} total`}
                    flush
                    action={
                        rolloutHasMore ? (
                            <Link
                                href={`/shop/${slug}/customers?source=rollout${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                                className="g-link"
                                style={{ paddingRight: 8 }}
                            >
                                View more
                                <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
                            </Link>
                        ) : null
                    }
                >
                    <div className={sh.tblWrap}>
                        <table className={cx(sh.tbl, sh.rowLink)}>
                            <thead>
                                <tr>
                                    <th>Member</th>
                                    <th>Location</th>
                                    <th>Joined</th>
                                    <th className={sh.r}>Appointments</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rolloutVisible.length === 0 ? (
                                    <EmptyRow
                                        colSpan={4}
                                        icon={<Users size={18} strokeWidth={2} />}
                                        title="No Rollout members match"
                                    />
                                ) : (
                                    rolloutVisible.map((p: any) => (
                                        <tr key={p.id}>
                                            <td>
                                                <span className={sh.cell}>
                                                    <span className={sh.av} aria-hidden="true">
                                                        {initials(p.display_name ?? p.handle)}
                                                    </span>
                                                    <span style={{ minWidth: 0 }}>
                                                        <Link href={`/shop/${slug}/customers/r-${p.id}`} className={sh.stretch}>
                                                            {p.display_name ?? '—'}
                                                        </Link>
                                                        <small>@{p.handle ?? '—'}</small>
                                                    </span>
                                                </span>
                                            </td>
                                            <td data-label="Location" className={sh.muted}>
                                                {p.location ?? '—'}
                                            </td>
                                            <td data-label="Joined" className={sh.when}>
                                                {fmtWhen(p.created_at, false)}
                                            </td>
                                            <td className={cx(sh.r, sh.num)} data-label="Appointments">
                                                {p.appt_count}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </Panel>
            )}

            {showLegacy && (
                <Panel
                    id="legacy-customers"
                    title="Legacy customers"
                    sub={`EMWRAPS records · ${legacyVisible.length} shown · ${legacy.totalDistinct} total`}
                    flush
                    action={
                        legacyHasMore ? (
                            <Link
                                href={`/shop/${slug}/customers?source=legacy${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                                className="g-link"
                                style={{ paddingRight: 8 }}
                            >
                                View more
                                <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
                            </Link>
                        ) : null
                    }
                >
                    <div className={sh.tblWrap}>
                        <table className={cx(sh.tbl, sh.rowLink)}>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Phone</th>
                                    <th>Joined</th>
                                    <th className={sh.r}>Tickets</th>
                                </tr>
                            </thead>
                            <tbody>
                                {legacyVisible.length === 0 ? (
                                    <EmptyRow
                                        colSpan={5}
                                        icon={<Users size={18} strokeWidth={2} />}
                                        title="No legacy customers match"
                                    />
                                ) : (
                                    legacyVisible.map((c: any) => (
                                        <tr key={c.id}>
                                            <td>
                                                <span className={sh.cell}>
                                                    <span className={sh.av} aria-hidden="true">
                                                        {initials(fmtName(c))}
                                                    </span>
                                                    <span style={{ minWidth: 0 }}>
                                                        <Link href={`/shop/${slug}/customers/l-${c.id}`} className={sh.stretch}>
                                                            {fmtName(c)}
                                                        </Link>
                                                        {c.company ? <small>{c.company}</small> : null}
                                                    </span>
                                                </span>
                                            </td>
                                            <td data-label="Email" className={sh.muted}>
                                                {c.email ?? '—'}
                                            </td>
                                            <td data-label="Phone" className={sh.when}>
                                                {c.phone ?? '—'}
                                            </td>
                                            <td data-label="Joined" className={cx(sh.when, sh.mHide)}>
                                                {fmtWhen(c.created_at, false)}
                                            </td>
                                            <td className={cx(sh.r, sh.num)} data-label="Tickets">
                                                {c.ticket_count}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </Panel>
            )}
        </div>
    );
}
