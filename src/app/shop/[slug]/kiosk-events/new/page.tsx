import Link from 'next/link';
import { ConsoleHead } from '@/components/glide-console/parts';
import { redirect } from 'next/navigation';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { createKioskEvent } from '../actions';
import { TagListEditor } from '../TagListEditor';
import { ChevronRight } from '@/components/icons';

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
            <ConsoleHead
                back={{ href: `/shop/${slug}/kiosk-events`, label: 'Kiosk events' }}
                title="New kiosk event"
                sub={`${shop.name} · saved as a draft; publish when it's ready`}
            />

            <form className="admin-form" action={createBound} style={{ maxWidth: 720 }}>
                <SectionHeading>Details</SectionHeading>
                <label className="admin-form-label">Title *</label>
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

                <label className="admin-form-label">Tagline</label>
                <input
                    name="tagline"
                    className="admin-form-input"
                    placeholder="Two classic Porsches. Four days. One legend."
                />

                <label className="admin-form-label">Description</label>
                <textarea
                    name="description"
                    className="admin-form-input"
                    rows={5}
                    placeholder="Full event description shown on the kiosk events page."
                />

                <SectionHeading>Dates</SectionHeading>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                        <label className="admin-form-label">Starts *</label>
                        <input type="date" name="starts_at" className="admin-form-input" required />
                    </div>
                    <div>
                        <label className="admin-form-label">Ends *</label>
                        <input type="date" name="ends_at" className="admin-form-input" required />
                    </div>
                </div>

                <SectionHeading>Venue</SectionHeading>
                <label className="admin-form-label">Venue name</label>
                <input
                    name="venue_name"
                    className="admin-form-input"
                    placeholder="The Shop Seattle"
                />
                <label className="admin-form-label">Venue address</label>
                <input
                    name="venue_address"
                    className="admin-form-input"
                    placeholder="2233 6th Ave S, Seattle, WA 98134"
                />

                <SectionHeading>Partners</SectionHeading>
                <TagListEditor
                    initial={[]}
                    mode="plain"
                    hiddenInputName="partners_json"
                    placeholder="RWB Seattle"
                />

                <SectionHeading>Highlights</SectionHeading>
                <TagListEditor
                    initial={[]}
                    mode="label-object"
                    hiddenInputName="highlights_json"
                    placeholder="Live build: Porsche 997"
                />

                <SectionHeading>Link</SectionHeading>
                <label className="admin-form-label">Link URL (QR target, optional)</label>
                <input
                    name="link_url"
                    className="admin-form-input"
                    placeholder="https://emwraps.net/events/rwb"
                />

                <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
                    <button type="submit" className="admin-form-btn">
                        CREATE DRAFT <ChevronRight />
                    </button>
                    <Link
                        href={`/shop/${slug}/kiosk-events`}
                        className="admin-action-btn muted"
                        style={{ textDecoration: 'none' }}
                    >
                        Cancel
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
