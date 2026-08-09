/**
 * /event/[id]/ics — downloadable iCalendar (.ics) file for a public event.
 *
 * No client JS, no external service. Emits a single VEVENT with a 3-hour
 * default duration (events schema has no end time). Only public, non-cancelled
 * events are served; anything else 404s.
 */
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toIcsDate(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
        d.getUTCFullYear().toString() +
        pad(d.getUTCMonth() + 1) +
        pad(d.getUTCDate()) +
        'T' +
        pad(d.getUTCHours()) +
        pad(d.getUTCMinutes()) +
        pad(d.getUTCSeconds()) +
        'Z'
    );
}

/** Escape per RFC 5545 (commas, semicolons, backslashes, newlines). */
function esc(s: string): string {
    return s
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r?\n/g, '\\n');
}

export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    if (!UUID_RE.test(id)) return new NextResponse('Not found', { status: 404 });

    const admin = getSupabaseAdmin();
    const { data } = await admin
        .from('events')
        .select('id, title, description, location_name, location_detail, start_at, visibility, cancelled_at')
        .eq('id', id)
        .maybeSingle();

    const ev = data as any;
    if (!ev || ev.visibility !== 'public' || ev.cancelled_at || !ev.start_at) {
        return new NextResponse('Not found', { status: 404 });
    }

    const start = toIcsDate(ev.start_at);
    const end = toIcsDate(new Date(new Date(ev.start_at).getTime() + 3 * 3600_000).toISOString());
    const now = toIcsDate(new Date().toISOString());
    const location = [ev.location_name, ev.location_detail].filter(Boolean).join(', ');
    const url = `https://rollout.club/event/${ev.id}`;
    const desc = [ev.description, url].filter(Boolean).join('\n\n');

    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Rollout//Meets//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:${ev.id}@rollout.club`,
        `DTSTAMP:${now}`,
        `DTSTART:${start}`,
        `DTEND:${end}`,
        `SUMMARY:${esc(ev.title ?? 'Car meet')}`,
        location ? `LOCATION:${esc(location)}` : '',
        desc ? `DESCRIPTION:${esc(desc)}` : '',
        `URL:${url}`,
        'END:VEVENT',
        'END:VCALENDAR',
    ].filter(Boolean);

    const body = lines.join('\r\n');
    const filename = `rollout-${(ev.title ?? 'event').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`;

    return new NextResponse(body, {
        status: 200,
        headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'public, max-age=300',
        },
    });
}
