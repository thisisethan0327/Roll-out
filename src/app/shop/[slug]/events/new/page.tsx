import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { createEvent } from '../actions';

export const metadata = { title: 'Host Event' };

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

const TYPES: { value: string; label: string }[] = [
    { value: 'NIGHT_RUN', label: 'NIGHT RUN' },
    { value: 'CAR_MEET', label: 'CAR MEET' },
    { value: 'TRACK_DAY', label: 'TRACK DAY' },
    { value: 'CRUISE', label: 'CRUISE' },
    { value: 'SHOW', label: 'SHOW' },
];

const VISIBILITY: { value: string; label: string }[] = [
    { value: 'public', label: 'PUBLIC' },
    { value: 'followers', label: 'FOLLOWERS' },
    { value: 'private', label: 'PRIVATE' },
];

export default async function NewEventPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const { shop, role } = await requireShopMemberBySlug(slug);
    if (!MANAGER_ROLES.has(role)) {
        redirect(`/shop/${slug}/events?error=insufficient_role`);
    }

    const createEventBound = createEvent.bind(null, shop.shopId);

    return (
        <>
            <div className="admin-page-head">
                <div>
                    <div className="admin-page-title">HOST EVENT</div>
                    <div className="admin-page-sub">{shop.name.toUpperCase()} · NEW EVENT</div>
                </div>
                <Link
                    href={`/shop/${slug}/events`}
                    className="admin-action-btn muted"
                    style={{ textDecoration: 'none' }}
                >
                    ‹ BACK
                </Link>
            </div>

            <form
                className="admin-form"
                action={createEventBound}
                style={{ maxWidth: 720 }}
            >
                <SectionHeading>TYPE</SectionHeading>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {TYPES.map((t, i) => (
                        <label
                            key={t.value}
                            className="admin-form-label"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                cursor: 'pointer',
                            }}
                        >
                            <input
                                type="radio"
                                name="type"
                                value={t.value}
                                defaultChecked={i === 0}
                                required
                            />
                            {t.label}
                        </label>
                    ))}
                </div>

                <SectionHeading>DETAILS</SectionHeading>
                <label className="admin-form-label">TITLE</label>
                <input
                    name="title"
                    className="admin-form-input"
                    minLength={4}
                    required
                    placeholder="Friday Night Cars & Coffee"
                />

                <label className="admin-form-label">DESCRIPTION</label>
                <textarea
                    name="description"
                    className="admin-form-input"
                    rows={4}
                    maxLength={400}
                    placeholder="What's the vibe? Who should come? (max 400 chars)"
                />

                <SectionHeading>LOCATION</SectionHeading>
                <label className="admin-form-label">LOCATION NAME *</label>
                <input
                    name="location_name"
                    className="admin-form-input"
                    placeholder="EMWRAPS Shop"
                    required
                    minLength={2}
                />

                <label className="admin-form-label">LOCATION DETAIL (OPTIONAL)</label>
                <input
                    name="location_detail"
                    className="admin-form-input"
                    placeholder="Back lot, gate 3"
                />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                        <label className="admin-form-label">LAT (OPTIONAL)</label>
                        <input
                            type="number"
                            step="any"
                            name="lat"
                            className="admin-form-input"
                            placeholder="47.5301"
                        />
                    </div>
                    <div>
                        <label className="admin-form-label">LNG (OPTIONAL)</label>
                        <input
                            type="number"
                            step="any"
                            name="lng"
                            className="admin-form-input"
                            placeholder="-122.3326"
                        />
                    </div>
                </div>

                <SectionHeading>WHEN & CAPACITY</SectionHeading>
                <label className="admin-form-label">START AT</label>
                <input
                    type="datetime-local"
                    name="start_at"
                    className="admin-form-input"
                    required
                />

                <label className="admin-form-label">CAPACITY (OPTIONAL)</label>
                <input
                    type="number"
                    min={1}
                    name="capacity"
                    className="admin-form-input"
                    placeholder="50"
                />

                <SectionHeading>VISIBILITY</SectionHeading>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {VISIBILITY.map((v) => (
                        <label
                            key={v.value}
                            className="admin-form-label"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                cursor: 'pointer',
                            }}
                        >
                            <input
                                type="radio"
                                name="visibility"
                                value={v.value}
                                defaultChecked={v.value === 'public'}
                                required
                            />
                            {v.label}
                        </label>
                    ))}
                </div>

                <SectionHeading>TAGS</SectionHeading>
                <label className="admin-form-label">TAGS (COMMA-SEPARATED)</label>
                <input
                    name="tags"
                    className="admin-form-input"
                    placeholder="jdm, lowered, weekly"
                />

                <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
                    <button type="submit" className="admin-form-btn">
                        HOST EVENT ›
                    </button>
                    <Link
                        href={`/shop/${slug}/events`}
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
