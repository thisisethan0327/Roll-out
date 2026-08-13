import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { getSupabasePublicAdmin } from '@/lib/supabase/admin';
import { KioskEventStatusActions } from '../KioskEventStatusActions';
import { KioskEventEditForm } from './KioskEventEditForm';
import { KioskEventImages } from './KioskEventImages';

export const metadata = { title: 'Kiosk Event' };

const STATUS_PILL: Record<string, string> = {
    published: 'admin-pill neon',
    draft: 'admin-pill gold',
    archived: 'admin-pill',
};

async function loadEvent(eventId: string, shopId: number) {
    const admin = getSupabasePublicAdmin();
    const { data, error } = await admin
        .from('events')
        .select('*')
        .eq('id', eventId)
        .eq('shop_id', shopId)
        .maybeSingle();
    if (error) console.error('[shop/kiosk-events/[id]] loadEvent failed:', error.message);
    return data as any;
}

export default async function KioskEventDetailPage({
    params,
    searchParams,
}: {
    params: Promise<{ slug: string; id: string }>;
    searchParams: Promise<{ just_created?: string }>;
}) {
    const { slug, id } = await params;
    const { just_created } = await searchParams;
    const { shop, role } = await requireShopMemberBySlug(slug);

    const event = await loadEvent(id, shop.shopId);
    if (!event) notFound();

    const gallery: string[] = Array.isArray(event.gallery)
        ? event.gallery.filter((u: any) => typeof u === 'string' && u)
        : [];

    return (
        <>
            {just_created === '1' ? (
                <div
                    style={{
                        margin: '0 0 12px 0',
                        padding: '12px 16px',
                        background: 'var(--gold-dim)',
                        border: '1px solid var(--gold)',
                        color: 'var(--gold)',
                        fontFamily: 'var(--font-display)',
                        fontSize: 12,
                        letterSpacing: 'var(--track-wider)',
                    }}
                >
                    ✓ DRAFT CREATED · ADD IMAGES BELOW, THEN PUBLISH TO PUT IT ON THE KIOSK
                </div>
            ) : null}
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">{event.title}</div>
                    <div className="admin-page-sub">
                        KIOSK EVENT · {event.starts_at} → {event.ends_at}
                    </div>
                </div>
                <Link
                    href={`/shop/${slug}/kiosk-events`}
                    className="admin-action-btn muted"
                    style={{ textDecoration: 'none' }}
                >
                    ‹ ALL KIOSK EVENTS
                </Link>
            </div>

            <div
                style={{
                    display: 'flex',
                    gap: 6,
                    flexWrap: 'wrap',
                    margin: '0 0 12px 0',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                <span className={STATUS_PILL[event.status] ?? 'admin-pill'}>
                    {String(event.status).toUpperCase()}
                </span>
                <KioskEventStatusActions
                    eventId={event.id}
                    shopId={shop.shopId}
                    slug={slug}
                    status={event.status}
                    callerRole={role}
                />
            </div>

            <div className="admin-two-col">
                <KioskEventEditForm event={event} shopId={shop.shopId} callerRole={role} />
                <KioskEventImages
                    eventId={event.id}
                    shopId={shop.shopId}
                    heroUrl={event.hero_image_url ?? null}
                    gallery={gallery}
                    callerRole={role}
                />
            </div>
        </>
    );
}
