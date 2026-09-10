import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    alternates: { canonical: '/help' },
    openGraph: { title: 'Help Center · Rollout', description: 'Is it free? Do you need the app? RSVPs, packages, hosting a meet, listing a shop.', type: 'website', url: '/help' },
    title: 'Help Center',
    description: 'Common questions about Rollout — is it free, do you need the app, RSVPs and packages, hosting a meet, listing a shop, your account.',
};

const FAQS: Array<{ q: string; a: string }> = [
    {
        q: 'Is Rollout free?',
        a: 'Free for drivers — your account, garage, RSVPs and messages cost nothing. Some meets offer paid packages set by the host; the price is shown on the event page before you check out.',
    },
    {
        q: 'Do I need the app?',
        a: 'No. Everything on rollout.club works in your browser: finding meets, RSVPs and waitlists, paid packages, calendar export, booking a shop, the store and your orders. The phone app adds the phone-first garage and posting, with the same account.',
    },
    {
        q: 'How do I RSVP to a meet?',
        a: 'Open a meet under Meets and tap Going. If the meet has a capacity you get a spot number; if it is full you join the waitlist and we tell you when a spot opens. Add it to your calendar from the event page.',
    },
    {
        q: 'What are packages and tiers?',
        a: 'Some hosts sell packages — a ticket tier or a bundle — on the event page. You check out with a card; your spot is held while you pay and confirmed the moment the payment lands. If a checkout is refused, nothing is charged.',
    },
    {
        q: 'How do I host a meet?',
        a: 'Ask for host access from your profile (Become a host). Verified hosts create meets from My events: type, time in your own zone, meet point, capacity, cover art and optional paid tiers — then invite people by email and manage the guest list and waitlist.',
    },
    {
        q: 'How do I list my shop?',
        a: 'Apply at Shops → List your shop. Once approved you get the shop console: your public page, services and appointments, tickets, products in the store, reviews and staff.',
    },
    {
        q: 'Can I book a shop online?',
        a: 'Shops that take appointments on Rollout show a Book button on their profile. Your appointments live under My account → Appointments, and you can message the shop directly from there.',
    },
    {
        q: 'How many vehicles and photos can I have?',
        a: 'Ten vehicles per account and up to 5 photos per vehicle. The first photo is your hero shot, shown on garage cards and the vehicle page. Photos are compressed before upload so your data plan doesn\'t take a hit.',
    },
    {
        q: 'How do I block or report someone?',
        a: 'In the app: tap the ⋯ menu on a post, profile or chat. Block hides you from each other both ways; Report sends the content to our moderation team, reviewed within 24 hours. On the web, email support@rollout.club with the link.',
    },
    {
        q: 'How do I delete my account?',
        a: 'Settings → Delete Account. Two-step confirmation, then your profile and content are permanently removed. Some moderation history is retained as required by law, but nothing user-facing remains.',
    },
];

/** FAQPage structured data — the same questions the page renders. */
const FAQ_LD = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
};

export default function HelpPage() {
    return (
        <div className="legal">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_LD) }} />
            <div className="container container-narrow">
                <div className="eyebrow eyebrow-gold mb-4">／ HELP CENTER</div>
                <h1>FAQ</h1>
                <div className="meta">COMMON QUESTIONS · UPDATED 2026-09-10</div>

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
