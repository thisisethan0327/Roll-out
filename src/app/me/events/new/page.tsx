/**
 * /me/events/new — a verified host creates a no-shop community event.
 * Mirrors the shop event form (reuses EventCoverPicker) but binds to
 * createHostEvent and is gated by requireVerifiedHost.
 */
import Link from 'next/link';
import { requireVerifiedHost } from '@/lib/me-guard';
import { NewHostEventForm } from './NewHostEventForm';

export const metadata = { title: 'Host Event' };

export default async function NewHostEventPage() {
    await requireVerifiedHost('/me/events/new');

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">HOST EVENT</div>
                    <div className="admin-page-sub">YOUR COMMUNITY EVENT · NO SHOP</div>
                </div>
                <Link href="/me/events" className="admin-action-btn muted" style={{ textDecoration: 'none' }}>‹ BACK</Link>
            </div>

            <NewHostEventForm />
        </>
    );
}
