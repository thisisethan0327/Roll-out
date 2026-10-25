/**
 * /me/events/new — a verified host creates a no-shop community event.
 * Mirrors the shop event form (reuses EventCoverPicker) but binds to
 * createHostEvent and is gated by requireVerifiedHost.
 *
 * Glide (board: G3 create event): the form in section cards, with the sections
 * as numbered rows beside it on wide screens.
 */
import { requireVerifiedHost } from '@/lib/me-guard';
import { NewHostEventForm } from './NewHostEventForm';
import { Card, Row } from '@/components/glide/primitives';
import { ConsoleHead } from '@/components/glide-console/parts';
import s from '@/components/glide-console/console.module.css';

export const metadata = { title: 'Host Event' };

const STEPS = [
    { id: 'type', label: 'Type & cover' },
    { id: 'details', label: 'Details' },
    { id: 'location', label: 'Location' },
    { id: 'route', label: 'Route destination' },
    { id: 'when', label: 'When & capacity' },
    { id: 'visibility', label: 'Visibility & tags' },
];

export default async function NewHostEventPage() {
    await requireVerifiedHost('/me/events/new');

    return (
        <div className={s.scope}>
            <ConsoleHead title="Host an event" back={{ href: '/me/events', label: 'My events' }} />
            <div className={s.sideR}>
                <NewHostEventForm />
                <div className={`${s.col} ${s.sticky} ${s.hideNarrow}`}>
                    <Card as="section" aria-label="Sections">
                        <ul className="g-rows" style={{ padding: '6px 0' }}>
                            {STEPS.map((st, i) => (
                                <Row key={st.id} href={`#${st.id}`} icon={<span className={s.stepNum} aria-hidden="true">{i + 1}</span>} label={st.label} />
                            ))}
                        </ul>
                    </Card>
                </div>
            </div>
        </div>
    );
}
