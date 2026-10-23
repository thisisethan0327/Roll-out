import type { Metadata } from 'next';
import { CalendarDays, Mail, Plus } from 'lucide-react';
import { Card, Chip } from '@/components/glide/primitives';
import '@/components/glide-auth/auth.css';

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
        a: 'On the web, email support@rollout.club with the link to the post, profile or conversation — every report is reviewed within 24 hours. In the app you can do it in place: tap the ⋯ menu on a post, profile or chat; Block hides you from each other both ways, Report sends the content to our moderation team.',
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
        <div className="glide glide-page ga-read">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_LD) }} />
            <div className="g-wrap">
                <div className="ga-read-grid is-single">
                    <Card as="article" className="ga-doc">
                        <header className="ga-doc-h">
                            <h1>Help center</h1>
                            <p className="ga-doc-meta">
                                <Chip icon={<CalendarDays size={14} strokeWidth={2} aria-hidden="true" />}>
                                    Updated · <span className="g-w">2026-09-10</span>
                                </Chip>
                                <span>Common questions</span>
                            </p>
                        </header>

                        <div className="ga-faq">
                            {FAQS.map((item, i) => (
                                <details key={i}>
                                    <summary>
                                        <span>{item.q}</span>
                                        <Plus size={20} strokeWidth={2} aria-hidden="true" />
                                    </summary>
                                    <p>{item.a}</p>
                                </details>
                            ))}
                        </div>
                    </Card>

                    <Card edge className="ga-cta">
                        <div>
                            <h2>Still need help?</h2>
                            <p>
                                Email <a className="ga-a" href="mailto:support@rollout.club">support@rollout.club</a>. We respond within 24
                                hours.
                            </p>
                        </div>
                        <div className="ga-cta-act">
                            <a className="g-sec" href="mailto:support@rollout.club">
                                <Mail size={18} strokeWidth={1.75} aria-hidden="true" />
                                Email support
                            </a>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
