import Link from 'next/link';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin, getSupabasePublicAdmin } from '@/lib/supabase/admin';

export const metadata = { title: 'Customer · Detail' };

const SERVICE_LABEL: Record<string, string> = {
    WRAP: 'VINYL WRAP',
    PPF: 'PPF',
    TINT: 'WINDOW TINT',
    CERAMIC: 'CERAMIC',
    PARTS: 'PARTS / INSTALL',
    OTHER: 'OTHER',
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
    if (!iso) return '—';
    return new Date(iso).toISOString().slice(0, 10);
}

function fmtDateTime(iso?: string | null) {
    if (!iso) return '—';
    return new Date(iso).toISOString().slice(0, 16).replace('T', ' ');
}

function initials(name?: string | null) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function pillTone(status?: string | null): '' | 'gold' | 'neon' | 'warn' {
    if (!status) return '';
    const s = status.toLowerCase();
    if (s === 'pending' || s === 'in_progress' || s === 'scheduled') return 'gold';
    if (s === 'accepted' || s === 'completed' || s === 'paid') return 'neon';
    if (s === 'declined' || s === 'cancelled' || s === 'canceled') return 'warn';
    return '';
}

/** Rollout-side detail loader. */
async function loadRolloutCustomer(profileId: string, shopId: number) {
    const admin = getSupabaseAdmin();
    const pub = getSupabasePublicAdmin();

    const [profileRes, apptRes, vehiclesRes] = await Promise.all([
        admin
            .from('profiles')
            .select(
                'id, handle, display_name, avatar_url, location, sector_code, kind, created_at, is_verified, rep_tier, rep_score, auth_user_id',
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

    const [custRes, ticketsRes] = await Promise.all([
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
    ]);

    return {
        customer: custRes.data as any,
        tickets: (ticketsRes.data ?? []) as any[],
    };
}

export default async function CustomerDetailPage({
    params,
}: {
    params: Promise<{ slug: string; id: string }>;
}) {
    const { slug, id } = await params;
    const { shop } = await requireShopMemberBySlug(slug);

    const prefix = id.slice(0, 2);
    const rawId = id.slice(2);

    if (prefix !== 'r-' && prefix !== 'l-') {
        return (
            <>
                <div className="admin-page-head">
                    <div>
                        <div className="admin-page-title">CUSTOMER</div>
                        <div className="admin-page-sub">UNRECOGNIZED ID PREFIX</div>
                    </div>
                    <Link
                        href={`/shop/${slug}/customers`}
                        className="admin-action-btn muted"
                        style={{ textDecoration: 'none' }}
                    >
                        ‹ ALL CUSTOMERS
                    </Link>
                </div>
                <div className="admin-empty">
                    ID MUST BE PREFIXED `r-` (ROLLOUT) OR `l-` (LEGACY).
                </div>
            </>
        );
    }

    if (prefix === 'r-') {
        return (
            <RolloutBranch slug={slug} shopId={shop.shopId} profileId={rawId} />
        );
    }
    return <LegacyBranch slug={slug} shopId={shop.shopId} customerId={rawId} />;
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
    const { profile, appts, vehicles, legacyTickets } = await loadRolloutCustomer(
        profileId,
        shopId,
    );

    if (!profile) {
        return (
            <>
                <div className="admin-page-head">
                    <div>
                        <div className="admin-page-title">CUSTOMER NOT FOUND</div>
                        <div className="admin-page-sub">PROFILE {profileId}</div>
                    </div>
                    <Link
                        href={`/shop/${slug}/customers`}
                        className="admin-action-btn muted"
                        style={{ textDecoration: 'none' }}
                    >
                        ‹ ALL CUSTOMERS
                    </Link>
                </div>
                <div className="admin-empty">NO ROLLOUT PROFILE WITH THIS ID.</div>
            </>
        );
    }

    // Compose a merged timeline (top 30).
    const timeline: TimelineEntry[] = [];
    for (const a of appts) {
        timeline.push({
            when: a.created_at,
            kind: 'appt',
            label: `APPT REQUEST · ${SERVICE_LABEL[a.service_type] ?? a.service_type ?? '—'}`,
            status: a.status,
            sub: a.preferred_at
                ? `PREFERRED ${a.preferred_at}`
                : a.notes
                  ? String(a.notes).slice(0, 80)
                  : null,
        });
    }
    for (const t of legacyTickets) {
        const veh = `${t.car_year ?? ''} ${t.car_make ?? ''} ${t.car_model ?? ''}`.trim();
        timeline.push({
            when: t.created_at,
            kind: 'ticket',
            label: `TICKET ${t.ticket_id ?? t.id.slice(0, 8)}`,
            status: t.status,
            sub: veh || null,
            amount: t.total_price,
        });
    }
    timeline.sort((a, b) => (b.when ?? '').localeCompare(a.when ?? ''));
    const topTimeline = timeline.slice(0, 30);

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">
                        {(profile.display_name ?? profile.handle ?? 'CUSTOMER').toUpperCase()}
                    </div>
                    <div className="admin-page-sub">
                        @{profile.handle ?? '—'}{' '}
                        <span
                            className="admin-pill gold"
                            style={{ marginLeft: 8 }}
                        >
                            ROLLOUT MEMBER
                        </span>
                        {profile.is_verified ? (
                            <span className="admin-pill neon" style={{ marginLeft: 6 }}>
                                ✓ VERIFIED
                            </span>
                        ) : null}
                    </div>
                </div>
                <Link
                    href={`/shop/${slug}/customers`}
                    className="admin-action-btn muted"
                    style={{ textDecoration: 'none' }}
                >
                    ‹ ALL CUSTOMERS
                </Link>
            </div>

            <IdentityPanel
                avatar={profile.avatar_url}
                name={profile.display_name}
                handle={profile.handle}
                email={null}
                phone={null}
                location={profile.location}
                joined={profile.created_at}
            />

            <SectionHead title="ACTIVITY TIMELINE" sub={`${topTimeline.length} ENTRIES`} />
            <Timeline entries={topTimeline} slug={slug} />

            <SectionHead
                title="VEHICLES"
                sub={`${vehicles.length} ON FILE`}
            />
            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>VEHICLE</th>
                            <th>COLOR</th>
                            <th>STAGE</th>
                        </tr>
                    </thead>
                    <tbody>
                        {vehicles.length === 0 ? (
                            <tr>
                                <td colSpan={3}>
                                    <div className="admin-empty">NO VEHICLES ON FILE</div>
                                </td>
                            </tr>
                        ) : (
                            vehicles.map((v: any) => (
                                <tr key={v.id}>
                                    <td>
                                        {`${v.year ?? ''} ${v.make ?? ''} ${v.model ?? ''}`.trim() || '—'}
                                        {v.trim ? (
                                            <div className="admin-handle">{v.trim}</div>
                                        ) : null}
                                    </td>
                                    <td>{v.color ?? '—'}</td>
                                    <td>
                                        {v.build_stage ? (
                                            <span className="admin-pill">{v.build_stage}</span>
                                        ) : (
                                            '—'
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <SectionHead title="NOTES" />
            <div className="admin-empty">
                NO INTERNAL NOTES YET — ROLLOUT-NATIVE NOTES COMING IN PHASE 2.
            </div>
        </>
    );
}

async function LegacyBranch({
    slug,
    shopId,
    customerId,
}: {
    slug: string;
    shopId: number;
    customerId: string;
}) {
    const { customer, tickets } = await loadLegacyCustomer(customerId, shopId);

    if (!customer) {
        return (
            <>
                <div className="admin-page-head">
                    <div>
                        <div className="admin-page-title">CUSTOMER NOT FOUND</div>
                        <div className="admin-page-sub">LEGACY {customerId}</div>
                    </div>
                    <Link
                        href={`/shop/${slug}/customers`}
                        className="admin-action-btn muted"
                        style={{ textDecoration: 'none' }}
                    >
                        ‹ ALL CUSTOMERS
                    </Link>
                </div>
                <div className="admin-empty">
                    NO EMWRAPS CUSTOMER WITH THIS ID AT YOUR SHOP.
                </div>
            </>
        );
    }

    const displayName =
        (customer.name && String(customer.name).trim()) ||
        `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim() ||
        customer.email ||
        customer.phone ||
        'CUSTOMER';

    const timeline: TimelineEntry[] = tickets.map((t: any) => {
        const veh = `${t.car_year ?? ''} ${t.car_make ?? ''} ${t.car_model ?? ''}`.trim();
        return {
            when: t.created_at,
            kind: 'ticket',
            label: `TICKET ${t.ticket_id ?? t.id.slice(0, 8)}`,
            status: t.status,
            sub: veh || (t.service_day ? `SERVICE DAY ${t.service_day}` : null),
            amount: t.total_price,
        };
    });
    timeline.sort((a, b) => (b.when ?? '').localeCompare(a.when ?? ''));
    const topTimeline = timeline.slice(0, 30);

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">
                        {String(displayName).toUpperCase()}
                    </div>
                    <div className="admin-page-sub">
                        {customer.email ?? customer.phone ?? '—'}{' '}
                        <span
                            className="admin-pill"
                            style={{ marginLeft: 8 }}
                        >
                            LEGACY CUSTOMER
                        </span>
                    </div>
                </div>
                <Link
                    href={`/shop/${slug}/customers`}
                    className="admin-action-btn muted"
                    style={{ textDecoration: 'none' }}
                >
                    ‹ ALL CUSTOMERS
                </Link>
            </div>

            <IdentityPanel
                avatar={null}
                name={displayName}
                handle={null}
                email={customer.email}
                phone={customer.phone}
                location={customer.company ?? null}
                joined={customer.created_at}
            />

            <SectionHead
                title="ACTIVITY TIMELINE"
                sub={`${topTimeline.length} ENTRIES`}
            />
            <Timeline entries={topTimeline} slug={slug} />

            <SectionHead title="VEHICLES" />
            <div className="admin-empty">
                LEGACY CUSTOMERS DON&apos;T HAVE OWNED VEHICLE RECORDS — VEHICLE DETAILS
                LIVE ON EACH TICKET.
            </div>

            <SectionHead title="NOTES" />
            {customer.notes ? (
                <div
                    style={{
                        border: '1px solid var(--bdr)',
                        background: 'var(--surf-1)',
                        padding: 14,
                        fontFamily: 'var(--font-display)',
                        fontSize: 12,
                        letterSpacing: 'var(--track-wide)',
                        color: 'var(--text-2)',
                        whiteSpace: 'pre-wrap',
                    }}
                >
                    {customer.notes}
                </div>
            ) : (
                <div className="admin-empty">NO NOTES ON FILE</div>
            )}
        </>
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
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: '88px 1fr',
                gap: 16,
                alignItems: 'center',
                border: '1px solid var(--bdr)',
                background: 'var(--surf-1)',
                padding: 16,
                marginTop: 8,
            }}
        >
            <div
                style={{
                    width: 88,
                    height: 88,
                    borderRadius: 6,
                    border: '1px solid var(--bdr)',
                    background: 'var(--surf-2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'var(--font-display)',
                    fontSize: 28,
                    letterSpacing: 'var(--track-wide)',
                    color: 'var(--gold)',
                    overflow: 'hidden',
                }}
            >
                {avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={avatar}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                ) : (
                    initials(name)
                )}
            </div>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: 12,
                }}
            >
                <IdField label="NAME" value={name ?? '—'} />
                <IdField label="HANDLE" value={handle ? `@${handle}` : '—'} />
                <IdField label="EMAIL" value={email ?? '—'} />
                <IdField label="PHONE" value={phone ?? '—'} />
                <IdField label="LOCATION" value={location ?? '—'} />
                <IdField label="JOINED" value={fmtDate(joined)} />
            </div>
        </div>
    );
}

function IdField({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div className="admin-stat-lbl" style={{ marginBottom: 2 }}>
                {label}
            </div>
            <div
                style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 13,
                    letterSpacing: 'var(--track-wide)',
                    color: 'var(--text-1)',
                    wordBreak: 'break-word',
                }}
            >
                {value}
            </div>
        </div>
    );
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
    return (
        <div
            className="admin-page-head"
            style={{ marginTop: 28, borderBottom: 'none', paddingBottom: 0 }}
        >
            <div>
                <div className="admin-page-title" style={{ fontSize: 14 }}>
                    {title}
                </div>
                {sub ? <div className="admin-page-sub">{sub}</div> : null}
            </div>
        </div>
    );
}

function Timeline({
    entries,
    slug,
}: {
    entries: TimelineEntry[];
    slug: string;
}) {
    if (entries.length === 0) {
        return <div className="admin-empty">NO ACTIVITY YET</div>;
    }
    return (
        <div className="admin-table-wrap">
            <table className="admin-table">
                <thead>
                    <tr>
                        <th>WHEN</th>
                        <th>EVENT</th>
                        <th>STATUS</th>
                        <th>DETAIL</th>
                        <th style={{ textAlign: 'right' }}>AMOUNT</th>
                    </tr>
                </thead>
                <tbody>
                    {entries.map((e, i) => (
                        <tr key={`${e.kind}-${i}-${e.when}`}>
                            <td>{fmtDateTime(e.when)}</td>
                            <td>
                                {e.kind === 'ticket' ? (
                                    <Link
                                        href={`/shop/${slug}/tickets`}
                                        style={{
                                            color: 'var(--gold)',
                                            textDecoration: 'none',
                                        }}
                                    >
                                        {e.label}
                                    </Link>
                                ) : (
                                    e.label
                                )}
                            </td>
                            <td>
                                {e.status ? (
                                    <span
                                        className={`admin-pill ${pillTone(e.status)}`}
                                    >
                                        {String(e.status).toUpperCase()}
                                    </span>
                                ) : (
                                    '—'
                                )}
                            </td>
                            <td>
                                <span className="admin-handle">{e.sub ?? '—'}</span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                                {typeof e.amount === 'number'
                                    ? `$${e.amount.toFixed(2)}`
                                    : '—'}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
