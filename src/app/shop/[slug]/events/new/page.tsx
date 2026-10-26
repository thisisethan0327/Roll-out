import Link from 'next/link';
import { ConsoleHead } from '@/components/glide-console/parts';
import { InfoTip } from '@/components/glide/InfoTip';
import { AREA_LABEL_TIP } from '@/lib/event-area-label';
import { redirect } from 'next/navigation';
import { requireShopMemberBySlug } from '@/lib/auth-guard';
import { createEvent } from '../actions';
import { EventCoverPicker } from '../EventCoverPicker';
import { TierRowsEditor } from '../TierRowsEditor';
import { EventStartAtField } from '@/components/EventStartAtField';
import { ChevronRight } from '@/components/icons';

export const metadata = { title: 'Host Event' };

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager']);

const VISIBILITY: { value: string; label: string }[] = [
    { value: 'public', label: 'Public' },
    { value: 'followers', label: 'Followers' },
    { value: 'private', label: 'Private' },
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
            <ConsoleHead
                back={{ href: `/shop/${slug}/events`, label: 'Events' }}
                title="Host event"
                sub={`${shop.name} · new event`}
            />

            <form
                className="admin-form"
                action={createEventBound}
                style={{ maxWidth: 720 }}
            >
                <SectionHeading>Type & cover</SectionHeading>
                <EventCoverPicker mode="create" />

                <SectionHeading>Details</SectionHeading>
                <label className="admin-form-label">Title</label>
                <input
                    name="title"
                    className="admin-form-input"
                    minLength={4}
                    required
                    placeholder="Friday Night Cars & Coffee"
                />

                <label className="admin-form-label">Description</label>
                <textarea
                    name="description"
                    className="admin-form-input"
                    rows={4}
                    maxLength={400}
                    placeholder="What's the vibe? Who should come? (max 400 chars)"
                />

                <SectionHeading>Location</SectionHeading>
                <label className="admin-form-label">Location name *</label>
                <input
                    name="location_name"
                    className="admin-form-input"
                    placeholder="EMWRAPS Shop"
                    required
                    minLength={2}
                />

                <label className="admin-form-label">Location detail</label>
                <input
                    name="location_detail"
                    className="admin-form-input"
                    placeholder="Back lot, gate 3"
                />

                <label className="admin-form-label">
                    General area <InfoTip text={AREA_LABEL_TIP} label="About General area" />
                </label>
                <input
                    name="area_label"
                    className="admin-form-input"
                    maxLength={60}
                    placeholder="e.g. Edmonds, WA"
                />

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
                    <div>
                        <label className="admin-form-label">Lat</label>
                        <input
                            type="number"
                            step="any"
                            name="lat"
                            className="admin-form-input"
                            style={{ width: '100%' }}
                            placeholder="47.5301"
                        />
                    </div>
                    <div>
                        <label className="admin-form-label">Lng</label>
                        <input
                            type="number"
                            step="any"
                            name="lng"
                            className="admin-form-input"
                            style={{ width: '100%' }}
                            placeholder="-122.3326"
                        />
                    </div>
                </div>

                <SectionHeading>When & capacity</SectionHeading>
                <label className="admin-form-label">Start at</label>
                <EventStartAtField />

                <label className="admin-form-label">Capacity</label>
                <input
                    type="number"
                    min={1}
                    name="capacity"
                    className="admin-form-input"
                    placeholder="50"
                />

                <SectionHeading>RSVP mode & tiers</SectionHeading>
                <TierRowsEditor />

                <SectionHeading>Visibility</SectionHeading>
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

                <SectionHeading>Tags</SectionHeading>
                <label className="admin-form-label">Tags (comma-separated)</label>
                <input
                    name="tags"
                    className="admin-form-input"
                    placeholder="jdm, lowered, weekly"
                />

                <div style={{ marginTop: 18, display: 'flex', gap: 8 }}>
                    <button type="submit" className="admin-form-btn">
                        Host event <ChevronRight />
                    </button>
                    <Link
                        href={`/shop/${slug}/events`}
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
