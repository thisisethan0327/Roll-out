import Link from 'next/link';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin, getSupabasePublicAdmin } from '@/lib/supabase/admin';
import { CalendarNav } from './CalendarGrid';

export const metadata = { title: 'Calendar' };

const SERVICE_LABEL: Record<string, string> = {
    WRAP: 'Vinyl Wrap',
    PPF: 'PPF',
    TINT: 'Window Tint',
    CERAMIC: 'Ceramic',
    PARTS: 'Parts/Install',
    OTHER: 'Other',
};

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];
const HOURS_START = 8; // 8am
const HOURS_END = 20;  // 8pm exclusive

function fmtYmd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function parseYmd(s: string): Date | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const d = new Date(s + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return null;
    return d;
}

function currentSunday(): Date {
    const today = new Date();
    const s = new Date(today);
    s.setDate(today.getDate() - today.getDay());
    s.setHours(0, 0, 0, 0);
    return s;
}

function formatRange(start: Date, end: Date): string {
    const sM = MONTHS[start.getMonth()];
    const eM = MONTHS[end.getMonth()];
    const sY = start.getFullYear();
    const eY = end.getFullYear();
    if (sY === eY && sM === eM) {
        return `${sM} ${start.getDate()} – ${end.getDate()}, ${eY}`;
    }
    return `${sM} ${start.getDate()} – ${eM} ${end.getDate()}, ${eY}`;
}

type CalEvent = {
    kind: 'appointment' | 'ticket';
    id: string;
    title: string;
    subtitle?: string;
    href: string;
    dayIdx: number; // 0=Sunday
    hour: number;   // 0-23 local
};

async function loadCalendar(shopId: number, weekStart: Date) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const rollout = getSupabaseAdmin();
    const pub = getSupabasePublicAdmin();

    const apptsP = rollout
        .from('appointment_requests')
        .select(
            `id, service_type, preferred_at, status, requester_profile_id,
              requester:profiles!appointment_requests_requester_profile_id_fkey(handle, display_name)`,
        )
        .eq('shop_id', shopId)
        .in('status', ['accepted', 'converted'])
        .not('preferred_at', 'is', null)
        .gte('preferred_at', weekStart.toISOString())
        .lt('preferred_at', weekEnd.toISOString())
        .order('preferred_at', { ascending: true });

    // Tickets — public.tickets may or may not have a shop_id column today.
    // Wrap so a "column doesn't exist" error doesn't break the page.
    let ticketsRows: any[] = [];
    try {
        const { data: tdata, error: terror } = await pub
            .from('tickets')
            .select('id, ticket_id, customer_name, service_day, services, end_date')
            .eq('shop_id', shopId)
            .gte('service_day', fmtYmd(weekStart))
            .lt('service_day', fmtYmd(weekEnd));
        if (!terror) ticketsRows = (tdata as any[]) ?? [];
    } catch {
        ticketsRows = [];
    }

    const { data: appts } = await apptsP;

    // Also pre-fetch the upcoming-next-week list
    const nextWeekStart = new Date(weekEnd);
    const nextWeekEnd = new Date(weekEnd);
    nextWeekEnd.setDate(weekEnd.getDate() + 14);
    const { data: upcomingNext } = await rollout
        .from('appointment_requests')
        .select(
            `id, service_type, preferred_at, status,
              requester:profiles!appointment_requests_requester_profile_id_fkey(handle, display_name)`,
        )
        .eq('shop_id', shopId)
        .in('status', ['accepted', 'converted'])
        .not('preferred_at', 'is', null)
        .gte('preferred_at', nextWeekStart.toISOString())
        .lt('preferred_at', nextWeekEnd.toISOString())
        .order('preferred_at', { ascending: true })
        .limit(5);

    return { appts: (appts as any[]) ?? [], tickets: ticketsRows, upcomingNext: (upcomingNext as any[]) ?? [] };
}

function bucketAppointment(a: any, weekStart: Date, slug: string): CalEvent | null {
    if (!a.preferred_at) return null;
    const dt = new Date(a.preferred_at);
    const dayMs = 86_400_000;
    const dayIdx = Math.floor((dt.getTime() - weekStart.getTime()) / dayMs);
    if (dayIdx < 0 || dayIdx > 6) return null;
    const hour = dt.getHours();
    const handle = a.requester?.handle ? `@${a.requester.handle}` : 'CUSTOMER';
    return {
        kind: 'appointment',
        id: a.id,
        title: handle,
        subtitle: SERVICE_LABEL[a.service_type] ?? a.service_type,
        href: `/shop/${slug}/inbox?status=${a.status === 'converted' ? 'CONVERTED' : 'ACCEPTED'}`,
        dayIdx,
        hour,
    };
}

function bucketTicket(t: any, weekStart: Date, slug: string): CalEvent | null {
    if (!t.service_day) return null;
    const dt = new Date(t.service_day + 'T09:00:00'); // tickets are day-level
    const dayMs = 86_400_000;
    // Normalize against weekStart on the same day boundary
    const startMidnight = new Date(weekStart);
    startMidnight.setHours(0, 0, 0, 0);
    const dayIdx = Math.floor((dt.getTime() - startMidnight.getTime()) / dayMs);
    if (dayIdx < 0 || dayIdx > 6) return null;
    return {
        kind: 'ticket',
        id: String(t.id),
        title: t.customer_name ?? `#${t.ticket_id ?? ''}`,
        subtitle: t.ticket_id ? `#${t.ticket_id}` : undefined,
        href: `/shop/${slug}/tickets/${t.id}`,
        dayIdx,
        hour: 9,
    };
}

export default async function ShopCalendarPage({
    params,
    searchParams,
}: {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ week?: string }>;
}) {
    const { slug } = await params;
    const { shop } = await requireShopMemberBySlug(slug);
    const { week } = await searchParams;

    const weekStart = (week && parseYmd(week)) || currentSunday();
    // Align to Sunday regardless of what user passed.
    const aligned = new Date(weekStart);
    aligned.setDate(weekStart.getDate() - weekStart.getDay());
    aligned.setHours(0, 0, 0, 0);
    const weekEnd = new Date(aligned);
    weekEnd.setDate(aligned.getDate() + 6);

    const { appts, tickets, upcomingNext } = await loadCalendar(shop.shopId, aligned);

    const events: CalEvent[] = [];
    for (const a of appts) {
        const e = bucketAppointment(a, aligned, slug);
        if (e) events.push(e);
    }
    for (const t of tickets) {
        const e = bucketTicket(t, aligned, slug);
        if (e) events.push(e);
    }

    // Build a Map<`${day}-${hour}`, CalEvent[]>
    const byCell = new Map<string, CalEvent[]>();
    for (const e of events) {
        const hr = Math.max(HOURS_START, Math.min(HOURS_END - 1, e.hour));
        const key = `${e.dayIdx}-${hr}`;
        const arr = byCell.get(key) ?? [];
        arr.push(e);
        byCell.set(key, arr);
    }

    const dayHeaders: { dow: string; date: number; isToday: boolean }[] = [];
    const todayYmd = fmtYmd(new Date());
    for (let i = 0; i < 7; i++) {
        const d = new Date(aligned);
        d.setDate(aligned.getDate() + i);
        dayHeaders.push({
            dow: DOW[i],
            date: d.getDate(),
            isToday: fmtYmd(d) === todayYmd,
        });
    }

    const hourRows: number[] = [];
    for (let h = HOURS_START; h < HOURS_END; h++) hourRows.push(h);

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">CALENDAR</div>
                    <div className="admin-page-sub">
                        {shop.name.toUpperCase()} · {formatRange(aligned, weekEnd).toUpperCase()}
                    </div>
                </div>
                <CalendarNav slug={slug} weekStart={fmtYmd(aligned)} />
            </div>

            <div className="admin-stat-grid">
                <Stat label="APPOINTMENTS" value={appts.length} />
                <Stat label="TICKETS" value={tickets.length} />
                <Stat label="TOTAL THIS WEEK" value={events.length} accent={events.length > 0 ? 'gold' : undefined} />
            </div>

            <div className="admin-table-wrap" style={{ marginTop: 12 }}>
                <table className="admin-table" style={{ tableLayout: 'fixed' }}>
                    <thead>
                        <tr>
                            <th style={{ width: 70 }}>TIME</th>
                            {dayHeaders.map((d, i) => (
                                <th key={i} style={{ color: d.isToday ? 'var(--gold)' : undefined }}>
                                    {d.dow} {d.date}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {hourRows.map((h) => {
                            const label = h === 12 ? '12PM' : h < 12 ? `${h}AM` : `${h - 12}PM`;
                            return (
                                <tr key={h}>
                                    <td style={{ fontFamily: 'var(--font-display)', fontSize: 11, opacity: 0.6 }}>
                                        {label}
                                    </td>
                                    {dayHeaders.map((_, dayIdx) => {
                                        const cell = byCell.get(`${dayIdx}-${h}`) ?? [];
                                        return (
                                            <td key={dayIdx} style={{ verticalAlign: 'top', padding: 4 }}>
                                                {cell.length === 0 ? (
                                                    <div style={{ opacity: 0.15, fontSize: 10 }}>·</div>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                        {cell.map((e) => (
                                                            <Link
                                                                key={`${e.kind}-${e.id}`}
                                                                href={e.href}
                                                                style={{ textDecoration: 'none' }}
                                                            >
                                                                <div
                                                                    className={`admin-pill ${e.kind === 'appointment' ? 'gold' : 'neon'}`}
                                                                    style={{
                                                                        display: 'block',
                                                                        textAlign: 'left',
                                                                        padding: '4px 6px',
                                                                        cursor: 'pointer',
                                                                        whiteSpace: 'nowrap',
                                                                        overflow: 'hidden',
                                                                        textOverflow: 'ellipsis',
                                                                    }}
                                                                    title={`${e.title}${e.subtitle ? ' · ' + e.subtitle : ''}`}
                                                                >
                                                                    {e.title}
                                                                    {e.subtitle && (
                                                                        <div
                                                                            style={{
                                                                                fontSize: 9,
                                                                                opacity: 0.7,
                                                                                marginTop: 2,
                                                                            }}
                                                                        >
                                                                            {e.subtitle}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </Link>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="admin-page-head" style={{ marginTop: 20, borderBottom: 'none', paddingBottom: 0 }}>
                <div>
                    <div className="admin-page-title" style={{ fontSize: 14 }}>
                        UPCOMING NEXT WEEK
                    </div>
                    <div className="admin-page-sub">TOP 5 PAST THIS WEEK&apos;S END</div>
                </div>
            </div>

            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>WHEN</th>
                            <th>CUSTOMER</th>
                            <th>SERVICE</th>
                            <th>STATUS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {upcomingNext.length === 0 ? (
                            <tr>
                                <td colSpan={4}>
                                    <div className="admin-empty">NOTHING ON THE BOOKS YET.</div>
                                </td>
                            </tr>
                        ) : (
                            upcomingNext.map((a: any) => (
                                <tr key={a.id}>
                                    <td>
                                        {a.preferred_at
                                            ? new Date(a.preferred_at).toISOString().slice(0, 16).replace('T', ' ')
                                            : '—'}
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
                                        <span className={`admin-pill ${a.status === 'converted' ? 'neon' : 'gold'}`}>
                                            {String(a.status).toUpperCase()}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
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
