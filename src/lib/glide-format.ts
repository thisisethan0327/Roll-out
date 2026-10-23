/**
 * Small date pieces for Glide surfaces (date roundels, time chips), always in
 * the event's own zone, the same way lib/event-time.ts formats the long form.
 */
import { DEFAULT_EVENT_TIME_ZONE, isValidTimeZone, zoneLabel } from './event-time';

export type EventDateParts = {
    /** "SUN" */
    dow: string;
    /** "26" */
    day: string;
    /** "Oct" */
    mon: string;
    /** "Sunday, October 26" */
    long: string;
    /** "7:00 AM" */
    clock: string;
    /** "PDT" */
    zone: string;
    /** "Sun 7:00 AM" */
    short: string;
    /** "Sun Oct 26" */
    dayLabel: string;
};

export function eventDateParts(iso: string | null | undefined, timeZone?: string | null): EventDateParts | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const tz = timeZone && isValidTimeZone(timeZone) ? timeZone : DEFAULT_EVENT_TIME_ZONE;
    const f = (o: Intl.DateTimeFormatOptions) => d.toLocaleString('en-US', { ...o, timeZone: tz });
    const dowShort = f({ weekday: 'short' });
    const mon = f({ month: 'short' });
    const day = f({ day: 'numeric' });
    const clock = f({ hour: 'numeric', minute: '2-digit' });
    return {
        dow: dowShort.toUpperCase(),
        day,
        mon,
        long: f({ weekday: 'long', month: 'long', day: 'numeric' }),
        clock,
        zone: zoneLabel(tz, d),
        short: `${dowShort} ${clock}`,
        dayLabel: `${dowShort} ${mon} ${day}`,
    };
}

/** "Car meet", "Night run" — sentence-case event type for sub-labels. */
export const EVENT_TYPE_LABEL: Record<string, string> = {
    CAR_MEET: 'Car meet',
    CRUISE: 'Cruise',
    SHOW: 'Show',
    TRACK_DAY: 'Track day',
    NIGHT_RUN: 'Night run',
};

export function eventTypeLabel(type: string | null | undefined): string {
    return (type && EVENT_TYPE_LABEL[type]) || 'Meet';
}

/** Title-case an ALL-CAPS place name the hosts typed ("GAS WORKS PARK" → "Gas Works Park"); mixed case is left alone. */
export function placeName(s: string | null | undefined): string | null {
    const t = s?.trim();
    if (!t) return null;
    if (t !== t.toUpperCase()) return t;
    return t.toLowerCase().replace(/(^|[\s\-/(&])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
}
