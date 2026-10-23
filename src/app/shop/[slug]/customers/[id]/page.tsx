import Link from 'next/link';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin, getSupabasePublicAdmin } from '@/lib/supabase/admin';
import { CustomerVehicles } from './CustomerVehicles';
import { CustomerEditForm } from './CustomerEditForm';
import { BadgeCheck, Car, CircleAlert, History } from 'lucide-react';
import { ConsoleHead } from '@/components/glide-console/parts';
import { EmptyRow, KVList, Panel, StatusChip, cx, fmtWhen, initials, shopStyles as sh } from '@/components/glide-shop/parts';

export const metadata = { title: 'Customer · Detail' };

const SERVICE_LABEL: Record<string, string> = {
    WRAP: 'Vinyl wrap',
    PPF: 'PPF',
    TINT: 'Window tint',
    CERAMIC: 'Ceramic',
    PARTS: 'Parts / install',
    OTHER: 'Other',
};

type TimelineEntry = {
    when: string;
    kind: 'appt' | 'ticket';
    label: string;
    status?: string | null;
    sub?: string | null;
    amount?: number | null;
};

function fmtDate(iso?: string | null) {
    return fmtWhen(iso, false);
}

function fmtDateTime(iso?: string | null) {
    return fmtWhen(iso);
}

/** Rollout-side detail loader. */
async function loadRolloutCustomer(profileId: string, shopId: number) {
    const admin = getSupabaseAdmin();
    const pub = getSupabasePublicAdmin();

    const [profileRes, apptRes, vehiclesRes] = await Promise.all([
        admin
            .from('profiles')
            .select(
                'id, handle, display_name, avatar_url, location, sector_code, kind, created_at, is_verified, level, xp_total, auth_user_id',
            )
            .eq('id', profileId)
            .maybeSingle(),
        admin
            .from('appointment_requests')
            .select('id, service_type, preferred_at, status, notes, created_at')
            .eq('shop_id', shopId)
            .eq('requester_profile_id', profileId)
            .order('created_at', { ascending: false })
            .limit(50),
        admin
            .from('vehicles')
            .select('id, year, make, model, trim, color, hero_image_url, build_stage')
            .eq('owner_id', profileId)
            .order('year', { ascending: false }),
    ]);

    for (const [label, res] of [
        ['profile', profileRes],
        ['appointments', apptRes],
        ['vehicles', vehiclesRes],
    ] as const) {
        if (res.error)
            console.error(`[shop/customers/[id]] rollout ${label} load failed:`, res.error.message);
    }

    // Try to surface their legacy tickets too (matched via the link_audit
    // table). Best-effort: missing data is fine.
    let legacyTickets: any[] = [];
    const authUserId = (profileRes.data as any)?.auth_user_id;
    if (authUserId) {
        const { data: links } = await admin
            .from('link_audit')
            .select('matched_customer_id')
            .eq('auth_user_id', authUserId)
            .not('matched_customer_id', 'is', null)
            .limit(20);
        const custIds = Array.from(
            new Set(
                (links ?? [])
                    .map((l: any) => l.matched_customer_id)
                    .filter(Boolean),
            ),
        ) as string[];
        if (custIds.length) {
            const { data: tx } = await pub
                .from('tickets')
                .select(
                    'id, ticket_id, status, total_price, services, car_year, car_make, car_model, created_at',
                )
                .eq('shop_id', shopId)
                .in('customer_id', custIds)
                .order('created_at', { ascending: false })
                .limit(50);
            legacyTickets = (tx ?? []) as any[];
        }
    }

    return {
        profile: profileRes.data as any,
        appts: (apptRes.data ?? []) as any[],
        vehicles: (vehiclesRes.data ?? []) as any[],
        legacyTickets,
    };
}

/** Legacy-side detail loader. */
async function loadLegacyCustomer(customerId: string, shopId: number) {
    const pub = getSupabasePublicAdmin();

    const [custRes, ticketsRes, vehiclesRes] = await Promise.all([
        pub
            .from('customers')
            .select(
                'id, first_name, last_name, name, email, phone, company, customer_type, source, status, notes, created_at',
            )
            .eq('id', customerId)
            .maybeSingle(),
        pub
            .from('tickets')
            .select(
                'id, ticket_id, status, total_price, services, car_year, car_make, car_model, color, vin, service_day, created_at',
            )
            .eq('shop_id', shopId)
            .eq('customer_id', customerId)
            .order('created_at', { ascending: false })
            .limit(50),
        pub
            .from('vehicles')
            .select('id, year, make, model, trim, color, vin, license_plate')
            .eq('shop_id', shopId)
            .eq('customer_id', customerId)
            .order('year', { ascending: false }),
    ]);

    for (const [label, res] of [
        ['customer', custRes],
        ['tickets', ticketsRes],
        ['vehicles', vehiclesRes],
    ] as const) {
        if (res.error)
            console.error(`[shop/customers/[id]] legacy ${label} load failed:`, res.error.message);
    }

    return {
        customer: custRes.data as any,
        tickets: (ticketsRes.data ?? []) as any[],
        vehicles: (vehiclesRes.data ?? []) as any[],
    };
}

export default async function CustomerDetailPage({
    params,
}: {
    params: Promise<{ slug: string; id: string }>;
}) {
    const { slug, id } = await params;
    const { shop, role } = await requireShopMemberBySlug(slug);

    const prefix = id.slice(0, 2);
    const rawId = id.slice(2);

    if (prefix !== 'r-' && prefix !== 'l-') {
        return (
            <NotFoundCard
                slug={slug}
                title="Customer"
                body="This link is not a customer record. Customer IDs start with r- (Rollout) or l- (legacy)."
            />
        );
    }

    if (prefix === 'r-') {
        return <RolloutBranch slug={slug} shopId={shop.shopId} profileId={rawId} />;
    }
    return <LegacyBranch slug={slug} shopId={shop.shopId} customerId={rawId} role={role} />;
}

function NotFoundCard({ slug, title, body }: { slug: string; title: string; body: string }) {
    return (
        <div className={sh.stack}>
            <ConsoleHead back={{ href: `/shop/${slug}/customers`, label: 'All customers' }} title={title} />
            <div className={sh.note} role="note">
                <CircleAlert size={20} strokeWidth={2} aria-hidden="true" />
                <span className={sh.noteText}>{body}</span>
            </div>
        </div>
    );
}

async function RolloutBranch({
    slug,
    shopId,
    profileId,
}: {
    slug: string;
    shopId: number;
    profileId: string;
}) {
    const { profile, appts, vehicles, legacyTickets } = await loadRolloutCustomer(profileId, shopId);

    if (!profile) {
        return <NotFoundCard slug={slug} title="Customer not found" body="There is no Rollout profile with this ID." />;
    }

    // Compose a merged timeline (top 30).
    const timeline: TimelineEntry[] = [];
    for (const a of appts) {
        timeline.push({
            when: a.created_at,
            kind: 'appt',
            label: `Appointment request · ${SERVICE_LABEL[a.service_type] ?? a.service_type ?? '—'}`,
            status: a.status,
            sub: a.preferred_at ? `Preferred ${fmtDateTime(a.preferred_at)}` : a.notes ? String(a.notes).slice(0, 80) : null,
        });
    }
    for (const t of legacyTickets) {
        const veh = `${t.car_year ?? ''} ${t.car_make ?? ''} ${t.car_model ?? ''}`.trim();
        timeline.push({
            when: t.created_at,
            kind: 'ticket',
            label: `Ticket ${t.ticket_id ?? t.id.slice(0, 8)}`,
            status: t.status,
            sub: veh || null,
            amount: t.total_price,
        });
    }
    timeline.sort((a, b) => (b.when ?? '').localeCompare(a.when ?? ''));
    const topTimeline = timeline.slice(0, 30);

    return (
        <div className={sh.stack}>
            <ConsoleHead
                back={{ href: `/shop/${slug}/customers`, label: 'All customers' }}
                title={profile.display_name ?? profile.handle ?? 'Customer'}
                sub={
                    <span className="g-chips">
                        <span className="g-chip">@{profile.handle ?? '—'}</span>
                        <span className="g-chip g-chip--tint">Rollout member</span>
                        {profile.is_verified ? (
                            <span className="g-chip g-chip--tint">
                                <BadgeCheck size={14} strokeWidth={2} aria-hidden="true" />
                                Verified
                            </span>
                        ) : null}
                    </span>
                }
            />

            <div className={sh.split}>
                <div className={sh.stack}>
                    <Panel id="timeline" title="Activity" sub={`${topTimeline.length} entries`} flush>
                        <Timeline entries={topTimeline} slug={slug} />
                    </Panel>
                    <Panel id="vehicles" title="Vehicles" sub={`${vehicles.length} on file`} flush>
                        <div className={sh.tblWrap}>
                            <table className={sh.tbl}>
                                <thead>
                                    <tr>
                                        <th>Vehicle</th>
                                        <th>Color</th>
                                        <th>Stage</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {vehicles.length === 0 ? (
                                        <EmptyRow
                                            colSpan={3}
                                            icon={<Car size={18} strokeWidth={2} />}
                                            title="No vehicles on file"
                                            body="Cars in this member's garage appear here."
                                        />
                                    ) : (
                                        vehicles.map((v: any) => (
                                            <tr key={v.id}>
                                                <td>
                                                    <b style={{ fontWeight: 600 }}>
                                                        {`${v.year ?? ''} ${v.make ?? ''} ${v.model ?? ''}`.trim() || '—'}
                                                    </b>
                                                    {v.trim ? <small>{v.trim}</small> : null}
                                                </td>
                                                <td data-label="Color">{v.color ?? '—'}</td>
                                                <td data-label="Stage">
                                                    {v.build_stage ? <span className="g-chip">{v.build_stage}</span> : '—'}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Panel>
                </div>
                <aside className={sh.stack}>
                    <IdentityPanel
                        avatar={profile.avatar_url}
                        name={profile.display_name}
                        handle={profile.handle}
                        email={null}
                        phone={null}
                        location={profile.location}
                        joined={profile.created_at}
                    />
                    <Panel id="notes" title="Notes">
                        <p className={sh.muted} style={{ margin: 0 }}>
                            Internal notes for Rollout members are not available yet.
                        </p>
                    </Panel>
                </aside>
            </div>
        </div>
    );
}

async function LegacyBranch({
    slug,
    shopId,
    customerId,
    role,
}: {
    slug: string;
    shopId: number;
    customerId: string;
    role: string;
}) {
    const { customer, tickets, vehicles } = await loadLegacyCustomer(customerId, shopId);

    if (!customer) {
        return (
            <NotFoundCard
                slug={slug}
                title="Customer not found"
                body="There is no EMWRAPS customer with this ID at your shop."
            />
        );
    }

    const displayName =
        (customer.name && String(customer.name).trim()) ||
        `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim() ||
        customer.email ||
        customer.phone ||
        'Customer';

    const timeline: TimelineEntry[] = tickets.map((t: any) => {
        const veh = `${t.car_year ?? ''} ${t.car_make ?? ''} ${t.car_model ?? ''}`.trim();
        return {
            when: t.created_at,
            kind: 'ticket',
            label: `Ticket ${t.ticket_id ?? t.id.slice(0, 8)}`,
            status: t.status,
            sub: veh || (t.service_day ? `Service day ${t.service_day}` : null),
            amount: t.total_price,
        };
    });
    timeline.sort((a, b) => (b.when ?? '').localeCompare(a.when ?? ''));
    const topTimeline = timeline.slice(0, 30);

    return (
        <div className={sh.stack}>
            <ConsoleHead
                back={{ href: `/shop/${slug}/customers`, label: 'All customers' }}
                title={String(displayName)}
                sub={
                    <span className="g-chips">
                        <span className="g-chip">{customer.email ?? customer.phone ?? '—'}</span>
                        <span className="g-chip">Legacy customer</span>
                    </span>
                }
            />

            <div className={sh.split}>
                <div className={sh.stack}>
                    <Panel id="timeline" title="Activity" sub={`${topTimeline.length} entries`} flush>
                        <Timeline entries={topTimeline} slug={slug} />
                    </Panel>
                    <Panel id="vehicles" title="Vehicles" sub={`${vehicles.length} on file`}>
                        <CustomerVehicles slug={slug} customerId={customer.id} vehicles={vehicles} callerRole={role} />
                    </Panel>
                </div>
                <aside className={sh.stack}>
                    <IdentityPanel
                        avatar={null}
                        name={displayName}
                        handle={null}
                        email={customer.email}
                        phone={customer.phone}
                        location={customer.company ?? null}
                        joined={customer.created_at}
                    />
                    <CustomerEditForm slug={slug} customer={customer} callerRole={role} />
                    <Panel id="notes" title="Notes">
                        {customer.notes ? (
                            <pre className={sh.pre}>{customer.notes}</pre>
                        ) : (
                            <p className={sh.muted} style={{ margin: 0 }}>
                                No notes on file
                            </p>
                        )}
                    </Panel>
                </aside>
            </div>
        </div>
    );
}

function IdentityPanel({
    avatar,
    name,
    handle,
    email,
    phone,
    location,
    joined,
}: {
    avatar: string | null;
    name: string | null;
    handle: string | null;
    email: string | null;
    phone: string | null;
    location: string | null;
    joined: string | null;
}) {
    return (
        <section className="g-card g-edge" aria-label="Contact">
            <div className={sh.idTop}>
                <span
                    className={sh.idAv}
                    style={avatar ? { backgroundImage: `url(${avatar})` } : undefined}
                    aria-hidden="true"
                >
                    {avatar ? null : initials(name)}
                </span>
                <div style={{ minWidth: 0 }}>
                    <h2 className={sh.idName}>{name ?? '—'}</h2>
                    {handle ? <p className={sh.idSub}>@{handle}</p> : null}
                </div>
            </div>
            <div style={{ padding: '0 24px 26px' }}>
                <KVList
                    rows={[
                        { k: 'Email', v: email ?? '—' },
                        { k: 'Phone', v: phone ?? '—' },
                        { k: 'Location', v: location ?? '—' },
                        { k: 'Joined', v: fmtDate(joined) },
                    ]}
                />
            </div>
        </section>
    );
}

function Timeline({ entries, slug }: { entries: TimelineEntry[]; slug: string }) {
    if (entries.length === 0) {
        return (
            <div className={sh.tblEmpty}>
                <span className="g-ic g-ic--sm" aria-hidden="true">
                    <History size={18} strokeWidth={2} />
                </span>
                <span>
                    <b>No activity yet</b>
                    <small>Appointment requests and tickets for this customer appear here.</small>
                </span>
            </div>
        );
    }
    return (
        <div className={sh.tblWrap}>
            <table className={sh.tbl}>
                <thead>
                    <tr>
                        <th>Event</th>
                        <th>Status</th>
                        <th>Detail</th>
                        <th>When</th>
                        <th className={sh.r}>Amount</th>
                    </tr>
                </thead>
                <tbody>
                    {entries.map((e, i) => (
                        <tr key={`${e.kind}-${i}-${e.when}`}>
                            <td>
                                {e.kind === 'ticket' ? (
                                    <Link href={`/shop/${slug}/tickets`} className="text-link">
                                        {e.label}
                                    </Link>
                                ) : (
                                    <b style={{ fontWeight: 600 }}>{e.label}</b>
                                )}
                            </td>
                            <td>{e.status ? <StatusChip status={e.status} /> : '—'}</td>
                            <td data-label="Detail" className={sh.muted}>
                                {e.sub ?? '—'}
                            </td>
                            <td data-label="When" className={sh.when}>
                                {fmtDateTime(e.when)}
                            </td>
                            <td className={cx(sh.r, sh.num)} data-label="Amount">
                                {typeof e.amount === 'number' ? `$${e.amount.toFixed(2)}` : '—'}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
