/**
 * TICKETS / DOOR LIST section (server component) for the shop console event
 * page and /me/events/[id]. Loads the door list with the MEMBER's own session
 * (host_event_tickets decides who may read it) and renders nothing at all when
 * the event has no tickets (free event, no rows) or the RPC isn't deployed.
 * The caller must already have authorized the viewer for the page itself.
 */
import { hostEventTickets } from '@/lib/event-tickets';
import { DoorList } from './DoorList';

type CheckIn = React.ComponentProps<typeof DoorList>['checkIn'];

export async function DoorSection({
    eventId,
    rsvpMode,
    cancelled,
    checkIn,
}: {
    eventId: string;
    rsvpMode: string | null | undefined;
    cancelled: boolean;
    checkIn: CheckIn;
}) {
    const ticketed = rsvpMode === 'tiered' || rsvpMode === 'paid';
    const res = await hostEventTickets(eventId);

    if (!res.ok && res.missing) return null;
    if (res.ok && res.rows.length === 0 && !ticketed) return null;

    return (
        <div id="door-list">
            <div className="admin-page-head" style={{ marginTop: 24, borderBottom: 'none', paddingBottom: 0 }}>
                <div>
                    <div className="admin-page-title" style={{ fontSize: 14 }}>
                        TICKETS / DOOR LIST
                    </div>
                    <div className="admin-page-sub">
                        {res.ok ? `${res.rows.length} CONFIRMED` : 'UNAVAILABLE'} · SWEATER SIZES · CHECK-IN
                    </div>
                </div>
            </div>
            {res.ok ? (
                <DoorList rows={res.rows} checkIn={checkIn} canCheckIn={!cancelled} />
            ) : (
                <div className="admin-empty">{res.error.toUpperCase()}</div>
            )}
        </div>
    );
}
