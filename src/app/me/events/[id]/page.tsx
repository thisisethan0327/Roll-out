/**
 * /me/events/[id] — host's own event detail: edit form, cancel, invitations,
 * and a log of invites already sent (from email_log). Ownership enforced:
 * host_id = caller, shop_id null; otherwise notFound.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireVerifiedHost } from '@/lib/me-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { InviteBranding, InviteEvent } from '@/lib/event-invites';
import { HostEventEditForm } from './HostEventEditForm';
import { HostInviteSection } from './HostInviteSection';

export const metadata = { title: 'Edit Event' };
export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = {
    NIGHT_RUN: 'NIGHT RUN',
    CAR_MEET: 'CAR MEET',
    TRACK_DAY: 'TRACK DAY',
    CRUISE: 'CRUISE',
    SHOW: 'SHOW',
};

export default async function HostEventDetail({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const profile = await requireVerifiedHost('/me/events');
    const admin = getSupabaseAdmin();

    const { data, error } = await admin
        .from('events')
        .select('id, shop_id, host_id, code, type, title, description, location_name, location_detail, lat, lng, start_at, capacity, visibility, tags, hero_image_url, cancelled_at')
        .eq('id', id)
        .maybeSingle();
    if (error) console.error('[me/events/[id]] event load failed:', error.message);
    const event = data as any;
    if (!event || event.host_id !== profile.profileId || event.shop_id != null) notFound();

    // Invites already sent (audit) for this event.
    const { data: sentRows, error: sentError } = await admin
        .from('email_log')
        .select('recipient_email, status, created_at')
        .eq('linked_event_id', id)
        .eq('template', 'platform_host_invite')
        .order('created_at', { ascending: false })
        .limit(50);
    if (sentError) console.error('[me/events/[id]] sent-invites load failed:', sentError.message);
    const sent = (sentRows as any[]) ?? [];

    const branding: InviteBranding = {
        shopName: 'Rollout',
        fromName: profile.displayName || profile.handle,
        logoUrl: null,
        primaryColor: '#e8a845',
        secondaryColor: '#e8a845',
        supportEmail: null,
        pageHandle: profile.handle,
    };
    const inviteEvent: InviteEvent = {
        id: event.id,
        title: event.title,
        typeLabel: TYPE_LABEL[event.type] ?? String(event.type ?? 'EVENT').replace(/_/g, ' '),
        startAtISO: event.start_at,
        locationName: event.location_name ?? '',
        locationDetail: event.location_detail ?? null,
        code: event.code ?? null,
        description: event.description ?? null,
    };

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">{(event.title ?? 'EVENT').toUpperCase()}</div>
                    <div className="admin-page-sub">
                        {event.code ?? TYPE_LABEL[event.type] ?? 'EVENT'}
                        {event.cancelled_at ? ' · CANCELLED' : ''}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <Link href={`/event/${event.id}`} className="admin-action-btn muted" style={{ textDecoration: 'none' }}>VIEW PUBLIC ›</Link>
                    <Link href="/me/events" className="admin-action-btn muted" style={{ textDecoration: 'none' }}>‹ MY EVENTS</Link>
                </div>
            </div>

            <HostEventEditForm event={event} />

            {!event.cancelled_at ? (
                <HostInviteSection
                    eventId={event.id}
                    branding={branding}
                    event={inviteEvent}
                    hostName={profile.displayName || profile.handle}
                />
            ) : null}

            {sent.length > 0 ? (
                <div style={{ marginTop: 24 }}>
                    <div className="admin-page-sub" style={{ marginBottom: 8 }}>INVITES SENT · {sent.length}</div>
                    <div className="admin-table-wrap">
                        <table className="admin-table">
                            <thead>
                                <tr><th>EMAIL</th><th>STATUS</th><th>WHEN</th></tr>
                            </thead>
                            <tbody>
                                {sent.map((s, i) => (
                                    <tr key={i}>
                                        <td>{s.recipient_email}</td>
                                        <td>{(s.status ?? 'sent').toUpperCase()}</td>
                                        <td>{new Date(s.created_at).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : null}
        </>
    );
}
