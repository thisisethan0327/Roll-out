import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireConsumer } from '@/lib/me-guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { loadMyGarage } from '@/lib/me-data';
import { BookForm } from './BookForm';
import { ChevronLeft } from 'lucide-react';
import { Card } from '@/components/glide/primitives';
import { dioramaFor } from '@/components/glide-discover/dioramas';
import '@/components/glide-discover/discover.css';

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

    // The shop's own diorama when it has one (keyed by handle here: this page
    // reads the profile only); otherwise a workshop plate.
    const dio = dioramaFor(handle);

    return (
        <div className="glide glide-page gd-page">
            <div className="g-wrap">
                <p className="gd-back">
                    <Link href={`/u/${handle}`} className="g-link">
                        <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
                        Back to {name}
                    </Link>
                </p>
                <div className="gd-bk">
                    <div className={dio ? 'gd-bk-cover gd-bk-cover--dio' : 'gd-bk-cover'}>
                        {dio ? (
                            <>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img className="g-only-light" src={dio.day} alt={dio.altDay} />
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img className="g-only-dark" src={dio.night} alt={dio.altNight} />
                            </>
                        ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src="/images/polish/banner-workshop-21x9.webp" alt="" />
                        )}
                        <div className="gd-id g-fp g-edge" aria-hidden="true">
                            <p className="gd-id-name">{name}</p>
                            <p className="gd-id-sub">@{handle} · Request a time, the shop confirms</p>
                        </div>
                    </div>
                    <Card edge className="gd-bk-card">
                        <h1>Book {name}</h1>
                        <p>Tell {name} what you need and when suits you. They confirm a time from their console.</p>
                        <BookForm shopId={Number(profile.shop_id)} handle={handle} vehicles={vehicles} />
                    </Card>
                </div>
            </div>
        </div>
    );
}
