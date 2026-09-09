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
 * like.
 *
 * TWO paths write this field, and both must use the SAME zone:
 *   1. the effect below, on mount and whenever the stored value changes;
 *   2. React 19's automatic form reset. `<form action={fn}>` resets every
 *      uncontrolled field to its `defaultValue` when the action completes, so
 *      after a save the field shows whatever `defaultValue` says. The first
 *      version rendered that in UTC and guarded the effect with a "touched"
 *      flag so it would not clobber typing — which meant a second save
 *      WITHOUT a reload re-read "18:00" (UTC) as Pacific and moved the meet
 *      +7 h, compounding on each save (run R12, verification lane).
 * So `defaultValue` is derived from the zone STATE: 'UTC' on the server and
 * on the first client render (identical markup), the browser's zone after
 * mount. The reset then restores the right wall clock, and the effect
 * overwrites unconditionally on a value change — a new stored value is the
 * server telling us the truth, and there is nothing worth protecting.
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
        // Re-render the stored instant in the viewer's zone. Unconditional: on
        // mount nobody has typed yet, and on a value change the server has
        // just told us what was saved.
        if (valueIso && ref.current) {
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
                defaultValue={valueIso ? utcToZonedWallClock(valueIso, zone) : ''}
            />
            <input type="hidden" name={EVENT_TZ_FIELD} value={zone} readOnly />
        </>
    );
}
