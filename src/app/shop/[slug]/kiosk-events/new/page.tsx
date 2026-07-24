import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { createKioskEvent } from '../actions';
import { TagListEditor } from '../TagListEditor';

export const metadata = { title: 'New Kiosk Event' };

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

export default async function NewKioskEventPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const { shop, role } = await requireShopMemberBySlug(slug);
    if (!MANAGER_ROLES.has(role)) {
        redirect(`/shop/${slug}/kiosk-events?error=insufficient_role`);
    }

    const createBound = createKioskEvent.bind(null, shop.shopId);

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">NEW KIOSK EVENT</div>
                    <div className="admin-page-sub">
                        {shop.name.toUpperCase()} · SAVED AS DRAFT — PUBLISH WHEN READY
                    </div>
                </div>
                <Link
                    href={`/shop/${slug}/kiosk-events`}
                    className="admin-action-btn muted"
                    style={{ textDecoration: 'none' }}
                >
                    ‹ BACK
                </Link>
            </div>

            <form className="admin-form" action={createBound} style={{ maxWidth: 720 }}>
                <SectionHeading>DETAILS</SectionHeading>
                <label className="admin-form-label">TITLE *</label>
                <input
                    name="title"
                    className="admin-form-input"
                    minLength={3}
                    required
                    placeholder="RWB Live Builds with Nakai-San"
                />
                <div className="admin-handle" style={{ margin: '4px 0 8px' }}>
                    TIP: THE KIOSK SPLITS THE TITLE AT &quot; WITH &quot; INTO A HEADLINE + ACCENT LINE.
                </div>

                <label className="admin-form-label">TAGLINE</label>
                <input
                    name="tagline"
                    className="admin-form-input"
                    placeholder="Two classic Porsches. Four days. One legend."
                />

                <label className="admin-form-label">DESCRIPTION</label>
                <textarea
                    name="description"
                    className="admin-form-input"
                    rows={5}
                    placeholder="Full event description shown on the kiosk events page."
                />

                <SectionHeading>DATES</SectionHeading>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                        <label className="admin-form-label">STARTS *</label>
                        <input type="date" name="starts_at" className="admin-form-input" required />
                    </div>
                    <div>
                        <label className="admin-form-label">ENDS *</label>
                        <input type="date" name="ends_at" className="admin-form-input" required />
                    </div>
                </div>

                <SectionHeading>VENUE</SectionHeading>
                <label className="admin-form-label">VENUE NAME</label>
                <input
                    name="venue_name"
                    className="admin-form-input"
                    placeholder="The Shop Seattle"
                />
                <label className="admin-form-label">VENUE ADDRESS</label>
                <input
                    name="venue_address"
                    className="admin-form-input"
                    placeholder="2233 6th Ave S, Seattle, WA 98134"
                />

                <SectionHeading>PARTNERS</SectionHeading>
                <TagListEditor
                    initial={[]}
                    mode="plain"
                    hiddenInputName="partners_json"
                    placeholder="RWB Seattle"
                />

                <SectionHeading>HIGHLIGHTS</SectionHeading>
                <TagListEditor
                    initial={[]}
                    mode="label-object"
                    hiddenInputName="highlights_json"
                    placeholder="Live build: Porsche 997"
                />

                <SectionHeading>LINK</SectionHeading>
                <label className="admin-form-label">LINK URL (QR TARGET, OPTIONAL)</label>
                <input
                    name="link_url"
                    className="admin-form-input"
                    placeholder="https://emwraps.net/events/rwb"
                />

                <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
                    <button type="submit" className="admin-form-btn">
                        CREATE DRAFT ›
                    </button>
                    <Link
                        href={`/shop/${slug}/kiosk-events`}
                        className="admin-action-btn muted"
                        style={{ textDecoration: 'none' }}
                    >
                        CANCEL
                    </Link>
                </div>
            </form>
        </>
    );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
    return (
        <div
            style={{
                marginTop: 14,
                marginBottom: 6,
                fontFamily: 'var(--font-display)',
                fontSize: 11,
                letterSpacing: 'var(--track-wider)',
                color: 'var(--gold)',
                borderTop: '1px solid var(--rule)',
                paddingTop: 10,
            }}
        >
            {children}
        </div>
    );
}
