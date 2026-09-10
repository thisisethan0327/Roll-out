import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireConsumer } from '@/lib/me-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { loadMyGarage } from '@/lib/me-data';
import { BookForm } from './BookForm';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
    const { handle } = await params;
    return { title: `Book ${handle}`, robots: { index: false } };
}

/**
 * /book/<shop> — request an appointment with a shop, on the web. Lives OUTSIDE
 * /u/[handle] on purpose: that segment has a loading.tsx, and a redirect below a
 * Suspense boundary streams inside a 200 (run 12) — here the sign-in redirect is
 * a real 307. The page looks the shop up itself and 404s a non-shop handle.
 */
export default async function BookPage({ params }: { params: Promise<{ handle: string }> }) {
    const { handle: raw } = await params;
    const handle = raw.replace(/^@+/, '').toLowerCase();
    const me = await requireConsumer(`/book/${handle}`);

    const admin = getSupabaseAdmin();
    const { data: profile } = await admin
        .from('profiles')
        .select('id, handle, display_name, kind, shop_id')
        .ilike('handle', handle)
        .maybeSingle();
    if (!profile || profile.kind !== 'shop_page' || !profile.shop_id) notFound();

    const garage = await loadMyGarage(me.profileId);
    const vehicles = garage.map((v: any) => ({ id: v.id as string, label: [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle' }));
    const name = profile.display_name || handle;

    return (
        <div className="admin-login-wrap">
            <div className="admin-login-card">
                <div className="eyebrow eyebrow-gold mb-4">／ BOOK ONLINE</div>
                <h1 className="admin-login-title">{name.toUpperCase()}</h1>
                <p className="admin-login-sub">Tell {name} what you need and when suits you. They confirm from their console.</p>
                <BookForm shopId={Number(profile.shop_id)} handle={handle} vehicles={vehicles} />
                <div style={{ marginTop: 18 }}>
                    <Link href={`/u/${handle}`} className="mono-row" style={{ textDecoration: 'none' }}>
                        <span className="accent">‹</span> BACK TO {name.toUpperCase()}
                    </Link>
                </div>
            </div>
        </div>
    );
}
