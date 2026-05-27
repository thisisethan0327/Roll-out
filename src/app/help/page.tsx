import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: 'Help Center',
    description: 'Common questions about Rollout — sign-in, garage, builds, photos, account.',
};

const FAQS: Array<{ q: string; a: string }> = [
    {
        q: 'Why didn\'t my magic link work when I clicked it?',
        a: 'Magic links open the Rollout mobile app via a custom URL scheme. If you tap the link on a desktop browser, nothing happens. Use the 6-digit code from the same email instead — it works on any device once Rollout is installed.',
    },
    {
        q: 'Can I sign in with the same email I use for EMWRAPS?',
        a: 'Yes. Rollout and EMWRAPS share a single Supabase auth backend, so the same email + password (or magic-link OTP) works on both. Your data is kept separate — your EMWRAPS tickets stay private to the EMWRAPS staff app; your Rollout garage stays private to Rollout.',
    },
    {
        q: 'How many photos can I attach to each vehicle?',
        a: 'Up to 5 per vehicle. The first one is your hero shot, shown on garage cards and the vehicle detail page. Photos are auto-compressed before upload so your data plan doesn\'t take a hit.',
    },
    {
        q: 'How many vehicles can I have?',
        a: 'Ten per account. Build them, sell them, swap them — soft-deleted vehicles auto-purge after 30 days, freeing up a slot.',
    },
    {
        q: 'Where are my photos stored?',
        a: 'Supabase Storage in our rollout-media bucket, served over CDN. Photos uploaded under your vehicles are only writable by you (RLS) but readable publicly via signed URLs, so they render in the feed and on other users\' profiles per your privacy settings.',
    },
    {
        q: 'Can I make my garage private?',
        a: 'Settings → Privacy. You can set DM policy (everyone / following / followers / none), enable Ghost Mode to hide your build + RSVPs from the public feed, hide your sector, or turn off tag requests. Followers-only filtering on individual builds is coming with the post composer update.',
    },
    {
        q: 'How do I block or report someone?',
        a: 'On any post, profile, or chat: tap the ⋯ menu. Block hides them both ways (you don\'t see their content, they don\'t see yours). Report flags the content for our moderation team — we review every report within 24 hours.',
    },
    {
        q: 'How do I delete my account?',
        a: 'Settings → Delete Account. Two-step confirmation, then your profile and content are permanently removed. Some moderation history is retained as required by law, but nothing user-facing remains.',
    },
    {
        q: 'I\'m an EMWRAPS customer — will Rollout link to my tickets?',
        a: 'Yes. When you sign in with the phone number you used at EMWRAPS, Rollout auto-links your account so you can DM the shop directly without manually finding the right thread.',
    },
];

export default function HelpPage() {
    return (
        <div className="legal">
            <div className="container container-narrow">
                <div className="eyebrow eyebrow-gold mb-4">／ HELP CENTER</div>
                <h1>FAQ</h1>
                <div className="meta">COMMON QUESTIONS · UPDATED 2026-05-27</div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {FAQS.map((item, i) => (
                        <details
                            key={i}
                            style={{
                                background: 'var(--bg-2)',
                                border: '1px solid var(--line)',
                                padding: '18px 22px',
                            }}
                        >
                            <summary
                                style={{
                                    cursor: 'pointer',
                                    fontFamily: 'var(--font-display)',
                                    fontSize: 14,
                                    fontWeight: 500,
                                    color: 'var(--text)',
                                    letterSpacing: 0.5,
                                    listStyle: 'none',
                                }}
                            >
                                {item.q}
                            </summary>
                            <p style={{ marginTop: 12, color: 'var(--text-2)', lineHeight: 1.65 }}>{item.a}</p>
                        </details>
                    ))}
                </div>

                <h2 style={{ marginTop: 56 }}>Still need help?</h2>
                <p>
                    Email <a href="mailto:support@rollout.club">support@rollout.club</a>. We respond within 24 hours.
                </p>

                <div style={{ marginTop: 48 }}>
                    <Link href="/" className="mono-row">
                        <span className="accent">←</span> BACK TO ROLLOUT.CLUB
                    </Link>
                </div>
            </div>
        </div>
    );
}
