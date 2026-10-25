import Link from 'next/link';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabaseAdmin, getSupabasePublicAdmin } from '@/lib/supabase/admin';
import { CalendarNav } from './CalendarGrid';
import { CalendarClock, CalendarDays, Wrench } from 'lucide-react';
import { ConsoleHead } from '@/components/glide-console/parts';
import { Counts, EmptyRow, Panel, StatusChip, cx, fmtWhen, shopStyles as sh } from '@/components/glide-shop/parts';

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
const DOW_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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

    const { data: appts, error: apptsError } = await apptsP;
    if (apptsError) console.error('[shop/calendar] appointments load failed:', apptsError.message);

    // Also pre-fetch the upcoming-next-week list
    const nextWeekStart = new Date(weekEnd);
    const nextWeekEnd = new Date(weekEnd);
    nextWeekEnd.setDate(weekEnd.getDate() + 14);
    const { data: upcomingNext, error: upcomingNextError } = await rollout
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
    if (upcomingNextError)
        console.error('[shop/calendar] upcoming-next load failed:', upcomingNextError.message);

    return { appts: (appts as any[]) ?? [], tickets: ticketsRows, upcomingNext: (upcomingNext as any[]) ?? [] };
}

function bucketAppointment(a: any, weekStart: Date, slug: string): CalEvent | null {
    if (!a.preferred_at) return null;
    const dt = new Date(a.preferred_at);
    const dayMs = 86_400_000;
    const dayIdx = Math.floor((dt.getTime() - weekStart.getTime()) / dayMs);
    if (dayIdx < 0 || dayIdx > 6) return null;
    const hour = dt.getHours();
    const handle = a.requester?.handle ? `@${a.requester.handle}` : 'Customer';
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

    // One column per day, the day's items in time order (tickets are day-level
    // and lead the day; appointments follow by hour).
    const byDay: CalEvent[][] = Array.from({ length: 7 }, () => []);
    for (const e of events) byDay[e.dayIdx]?.push(e);
    for (const list of byDay) list.sort((a, b) => (a.kind === b.kind ? a.hour - b.hour : a.kind === 'ticket' ? -1 : 1));
    const hourLabel = (h: number) => (h === 12 ? '12 PM' : h < 12 ? `${h} AM` : `${h - 12} PM`);

    return (
        <div className={sh.stack}>
            <ConsoleHead
                title="Calendar"
                sub={`${shop.name} · ${formatRange(aligned, weekEnd)}`}
                actions={<CalendarNav slug={slug} weekStart={fmtYmd(aligned)} />}
            />

            <Counts
                label="This week"
                items={[
                    { label: 'Appointments', value: appts.length },
                    { label: 'Tickets', value: tickets.length },
                    { label: 'Total this week', value: events.length, dot: events.length > 0 },
                ]}
            />

            <section className="g-card" aria-label={`Week of ${formatRange(aligned, weekEnd)}`}>
                <div className={sh.panelH}>
                    <div>
                        <h2>{formatRange(aligned, weekEnd)}</h2>
                    </div>
                    <div className={sh.legend} aria-label="Legend">
                        <span className="g-chip">
                            <CalendarClock size={14} strokeWidth={2} aria-hidden="true" />
                            Appointment
                        </span>
                        <span className="g-chip g-chip--tint">
                            <Wrench size={14} strokeWidth={2} aria-hidden="true" />
                            Ticket
                        </span>
                    </div>
                </div>
                <div className={sh.week}>
                    {dayHeaders.map((d, i) => (
                        <div key={i} className={sh.dayCol}>
                            <div className={sh.dayHead}>
                                <span className={cx(sh.dayNum, d.isToday && sh.dayToday)} aria-hidden="true">
                                    {d.date}
                                </span>
                                <small>
                                    {DOW_LABEL[i]}
                                    {d.isToday ? ' · Today' : ''}
                                </small>
                                <span className="g-sr">
                                    {DOW_LABEL[i]} {d.date}
                                </span>
                            </div>
                            {byDay[i].length === 0 ? (
                                <span className={sh.dayEmpty}>Nothing booked</span>
                            ) : (
                                byDay[i].map((e) => (
                                    <Link
                                        key={`${e.kind}-${e.id}`}
                                        href={e.href}
                                        className={cx(sh.evt, e.kind === 'ticket' && sh.evtTicket)}
                                        title={`${e.title}${e.subtitle ? ' · ' + e.subtitle : ''}`}
                                    >
                                        <span className={sh.evtTime}>
                                            {e.kind === 'ticket' ? 'Service day' : hourLabel(Math.max(HOURS_START, Math.min(HOURS_END - 1, e.hour)))}
                                        </span>
                                        <b>{e.title}</b>
                                        {e.subtitle ? <small>{e.subtitle}</small> : null}
                                    </Link>
                                ))
                            )}
                        </div>
                    ))}
                </div>
            </section>

            <Panel id="next-week" title="Upcoming next week" sub="The first 5 after this week ends" flush>
                <div className={sh.tblWrap}>
                    <table className={sh.tbl}>
                        <thead>
                            <tr>
                                <th>When</th>
                                <th>Customer</th>
                                <th>Service</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {upcomingNext.length === 0 ? (
                                <EmptyRow
                                    colSpan={4}
                                    icon={<CalendarDays size={18} strokeWidth={2} />}
                                    title="Nothing on the books yet"
                                />
                            ) : (
                                upcomingNext.map((a: any) => (
                                    <tr key={a.id}>
                                        <td className={sh.when}>{fmtWhen(a.preferred_at)}</td>
                                        <td>
                                            @{a.requester?.handle ?? '?'}
                                            <small>{a.requester?.display_name}</small>
                                        </td>
                                        <td>
                                            <span className="g-chip">{SERVICE_LABEL[a.service_type] ?? a.service_type}</span>
                                        </td>
                                        <td>
                                            <StatusChip status={a.status} />
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Panel>
        </div>
    );
}
