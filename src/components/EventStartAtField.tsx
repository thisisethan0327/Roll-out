'use client';

/**
 * The event start-time field, and the zone that gives it meaning.
 *
 * `<input type="datetime-local">` submits a WALL CLOCK with no zone. Whoever
 * reads it then has to choose one, and before R12 the two ends chose
 * differently — the server parsed it as its own (UTC), the edit form rendered
 * it back in the browser's — so every save moved the meet by the offset. See
 * lib/event-time.ts.
 *
 * This renders both halves together so they cannot drift apart again: the
 * visible field and a hidden `start_at_tz` naming the zone it was typed in.
 *
 * SSR renders the wall clock in UTC and the browser corrects it on mount. That
 * order is deliberate: reading the browser's zone during render would make the
 * server and client markup disagree and React would keep whichever it felt
 * like. The input is uncontrolled and written through a ref, so a value the
 * user has already touched is never clobbered.
 */
import { useEffect, useRef, useState } from 'react';
import {
    EVENT_TZ_FIELD,
    browserTimeZone,
    utcToZonedWallClock,
} from '@/lib/event-time';

export function EventStartAtField({
    valueIso,
    className = 'admin-form-input',
    name = 'start_at',
    required = true,
    disabled = false,
}: {
    /** Stored UTC instant, or null when creating. */
    valueIso?: string | null;
    className?: string;
    name?: string;
    required?: boolean;
    disabled?: boolean;
}) {
    const ref = useRef<HTMLInputElement>(null);
    const [zone, setZone] = useState('UTC');

    useEffect(() => {
        const tz = browserTimeZone();
        setZone(tz);
        // Re-render the stored instant in the viewer's zone. Only the untouched
        // server-rendered value is replaced.
        if (valueIso && ref.current && !ref.current.dataset.touched) {
            ref.current.value = utcToZonedWallClock(valueIso, tz);
        }
    }, [valueIso]);

    return (
        <>
            <input
                ref={ref}
                type="datetime-local"
                name={name}
                className={className}
                required={required}
                disabled={disabled}
                defaultValue={valueIso ? utcToZonedWallClock(valueIso, 'UTC') : ''}
                onChange={(e) => {
                    e.currentTarget.dataset.touched = '1';
                }}
            />
            <input type="hidden" name={EVENT_TZ_FIELD} value={zone} readOnly />
        </>
    );
}
