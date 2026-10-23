'use client';
/**
 * The web appointment request, in Glide (board G5, "Pick a time").
 *
 * The board shows open and taken drop-off slots; Rollout has no shop hours or
 * availability, so this form never pretends to: the member suggests a day and
 * a time (both optional, as before) and the shop confirms from its console.
 * Fields and the server action are unchanged: service_type, preferred_at (a
 * wall clock in the visitor's zone, with preferred_at_tz), vehicle_id, notes.
 * The primary action is the slide-to-act control (drag, tap or Enter).
 */
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { CalendarSearch, Car, CircleSlash, Droplets, Layers, Paintbrush, Shield, SunDim, Wrench } from 'lucide-react';
import { requestAppointmentAction } from './actions';
import { SERVICE_LABEL, SERVICE_TYPES } from './services';
import { browserTimeZone } from '@/lib/event-time';
import { SlideToAct } from '@/components/glide/SlideToAct';

const SERVICE_ICON: Record<(typeof SERVICE_TYPES)[number], typeof Layers> = {
    WRAP: Paintbrush,
    PPF: Shield,
    TINT: SunDim,
    CERAMIC: Droplets,
    PARTS: Wrench,
    OTHER: Layers,
};

type Day = { value: string; dow: string; day: string; label: string };

/** The next 14 days in the visitor's own calendar (YYYY-MM-DD, local). */
function nextDays(n = 14): Day[] {
    const out: Day[] = [];
    const now = new Date();
    for (let i = 0; i < n; i++) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
        const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        out.push({
            value,
            dow: i === 0 ? 'TODAY' : d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
            day: String(d.getDate()),
            label: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
        });
    }
    return out;
}

function prettyDate(value: string): string {
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return value;
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function prettyTime(hhmm: string): string {
    const [h, m] = hhmm.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
    return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function BookForm({
    shopId,
    handle,
    vehicles,
}: {
    shopId: number;
    handle: string;
    vehicles: { id: string; label: string }[];
}) {
    const formRef = useRef<HTMLFormElement>(null);
    const serviceRef = useRef<HTMLDivElement>(null);
    const timeRef = useRef<HTMLInputElement>(null);
    const [tz, setTz] = useState('');
    const [days, setDays] = useState<Day[]>([]);
    const [service, setService] = useState<string>('');
    // '' = no preference; 'other' = the date field below; else YYYY-MM-DD.
    const [day, setDay] = useState('');
    const [otherDate, setOtherDate] = useState('');
    const [time, setTime] = useState('');
    const [vehicle, setVehicle] = useState('');
    const [err, setErr] = useState<string | null>(null);
    // Kit workaround: SlideToAct keeps its knob at the end after onComplete
    // unless `done` changes, so a refused submit remounts it to spring back.
    const [slideKey, setSlideKey] = useState(0);
    const fail = (msg: string) => {
        setErr(msg);
        setSlideKey((k) => k + 1);
    };
    const [pending, start] = useTransition();

    useEffect(() => {
        setTz(browserTimeZone());
        setDays(nextDays());
    }, []);

    const date = day === 'other' ? otherDate : day;
    const preferredAt = date && time ? `${date}T${time}` : '';
    const minDate = days[0]?.value;

    const summary = useMemo(() => {
        const svc = service ? SERVICE_LABEL[service as (typeof SERVICE_TYPES)[number]] : 'Pick a service';
        const when = date ? `${prettyDate(date)}${time ? ` · ${prettyTime(time)}` : ''}` : 'Any day, the shop suggests a time';
        return { svc, when };
    }, [service, date, time]);

    const submit = () => {
        if (pending) return;
        setErr(null);
        if (!service) {
            fail('Pick a service first.');
            serviceRef.current?.querySelector<HTMLInputElement>('input')?.focus();
            return;
        }
        if (date && !time) {
            fail('Add a time for that day, or choose No preference.');
            timeRef.current?.focus();
            return;
        }
        const form = formRef.current;
        if (!form) return;
        const fd = new FormData(form);
        start(async () => {
            const res = await requestAppointmentAction(fd);
            if (res && !res.ok) fail(res.error); // success redirects
        });
    };

    const dayButton = (value: string, top: React.ReactNode, main: React.ReactNode, label: string, extra = '') => (
        <button
            key={value || 'none'}
            type="button"
            aria-pressed={day === value}
            aria-label={label}
            className={`gd-day${extra}`}
            onClick={() => setDay(value)}
        >
            {top}
            {main}
        </button>
    );

    return (
        <form
            ref={formRef}
            onSubmit={(e) => {
                e.preventDefault();
                submit();
            }}
        >
            <input type="hidden" name="shop_id" value={shopId} />
            <input type="hidden" name="handle" value={handle} />
            <input type="hidden" name="preferred_at_tz" value={tz} />
            <input type="hidden" name="preferred_at" value={preferredAt} />

            <fieldset className="gd-fs">
                <div className="gd-lab">
                    <legend>Service</legend>
                    <small>Required</small>
                </div>
                <div className="gd-svc" ref={serviceRef}>
                    {SERVICE_TYPES.map((s) => {
                        const Icon = SERVICE_ICON[s];
                        return (
                            <label key={s} className="gd-opt">
                                <input type="radio" name="service_type" value={s} checked={service === s} onChange={() => setService(s)} />
                                <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
                                {SERVICE_LABEL[s]}
                            </label>
                        );
                    })}
                </div>
            </fieldset>

            <div className="gd-lab">
                <b id="bk-day">Preferred day</b>
                <small>Optional · the shop confirms</small>
            </div>
            <div className="gd-days" role="group" aria-labelledby="bk-day">
                {dayButton(
                    '',
                    <CircleSlash size={16} strokeWidth={2} aria-hidden="true" />,
                    <span style={{ marginLeft: 6 }}>No preference</span>,
                    'No preference',
                    ' gd-day--any',
                )}
                {days.map((d) => dayButton(d.value, <small>{d.dow}</small>, <b>{d.day}</b>, d.label))}
                {dayButton(
                    'other',
                    <CalendarSearch size={16} strokeWidth={2} aria-hidden="true" />,
                    <span style={{ marginLeft: 6 }}>Later date</span>,
                    'A later date',
                    ' gd-day--any',
                )}
            </div>

            {day ? (
                <div className="gd-when">
                    {day === 'other' ? (
                        <div>
                            <label className="gd-when-lab" htmlFor="bk-date">
                                Date
                            </label>
                            <input
                                id="bk-date"
                                type="date"
                                className="gd-field"
                                min={minDate}
                                value={otherDate}
                                onChange={(e) => setOtherDate(e.target.value)}
                            />
                        </div>
                    ) : null}
                    <div style={day === 'other' ? undefined : { gridColumn: '1 / -1' }}>
                        <label className="gd-when-lab" htmlFor="bk-time">
                            Preferred time
                        </label>
                        <input
                            id="bk-time"
                            ref={timeRef}
                            type="time"
                            className="gd-field"
                            step={900}
                            value={time}
                            onChange={(e) => setTime(e.target.value)}
                            aria-describedby="bk-zone"
                        />
                    </div>
                </div>
            ) : null}
            <p className="gd-zone" id="bk-zone">
                {tz ? `Times are in your zone, ${tz.replace(/_/g, ' ')}.` : ' '}
            </p>

            {vehicles.length > 0 ? (
                <fieldset className="gd-fs">
                    <div className="gd-lab">
                        <legend>Vehicle</legend>
                        <small>Optional</small>
                    </div>
                    <div className="gd-veh">
                        <label className="gd-opt">
                            <input type="radio" name="vehicle_id" value="" checked={vehicle === ''} onChange={() => setVehicle('')} />
                            <CircleSlash size={18} strokeWidth={1.9} aria-hidden="true" />
                            Not now
                        </label>
                        {vehicles.map((v) => (
                            <label key={v.id} className="gd-opt">
                                <input type="radio" name="vehicle_id" value={v.id} checked={vehicle === v.id} onChange={() => setVehicle(v.id)} />
                                <Car size={18} strokeWidth={1.9} aria-hidden="true" />
                                {v.label}
                            </label>
                        ))}
                    </div>
                </fieldset>
            ) : null}

            <div className="gd-fieldwrap">
                <label htmlFor="bk-notes">Notes · optional</label>
                <textarea
                    id="bk-notes"
                    name="notes"
                    className="gd-field"
                    rows={4}
                    maxLength={600}
                    placeholder="What you have in mind, colours, deadlines"
                />
            </div>

            <p className="gd-sum" aria-live="polite">
                <b>{summary.svc}</b> · {summary.when}
            </p>

            {err ? (
                <div className="g-note gd-err" role="alert">
                    {err}
                </div>
            ) : null}

            <div className="gd-bk-act">
                <SlideToAct
                    key={slideKey}
                    label="Slide to request"
                    doneLabel="Sending"
                    ariaLabel="Send the appointment request"
                    busy={pending}
                    onComplete={submit}
                />
            </div>
            <p className="gd-bk-foot">
                The shop confirms a time from its console. You will see the request under Account, Appointments.
            </p>
        </form>
    );
}
