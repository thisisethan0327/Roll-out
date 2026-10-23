import { CalendarDays, Mail } from 'lucide-react';
import { LEGAL, type LegalDoc } from '@/lib/legal';
import { Card, Chip, Tricolore } from '@/components/glide/primitives';
import '@/components/glide-auth/auth.css';

type DocKey = keyof typeof LEGAL;

/** "4. Your content" → "your-content", for the section anchors. */
function anchor(heading: string, i: number): string {
    const slug = heading
        .toLowerCase()
        .replace(/^\d+\.\s*/, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug ? `s-${slug}` : `s-${i + 1}`;
}

/**
 * Terms, Privacy, Community Guidelines and the Refund policy in Glide's Read
 * mode: Chakra Petch heads, Inter Tight body at a comfortable measure, and an
 * "On this page" list beside the document on wide screens. The words come
 * from lib/legal.ts unchanged.
 */
export function LegalPage({ docKey }: { docKey: DocKey }) {
    const doc: LegalDoc = LEGAL[docKey];
    const ids = doc.body.map((s, i) => anchor(s.heading, i));

    return (
        <div className="glide glide-page ga-read">
            <div className="g-wrap">
                <div className="ga-read-grid">
                    <Card as="aside" className="ga-toc" aria-labelledby="legal-toc">
                        <h2 id="legal-toc">On this page</h2>
                        <ol>
                            {doc.body.map((section, i) => (
                                <li key={ids[i]}>
                                    <a href={`#${ids[i]}`}>{section.heading}</a>
                                </li>
                            ))}
                        </ol>
                    </Card>
                    <Card as="article" className="ga-doc">
                        <header className="ga-doc-h">
                            <h1>{doc.title}</h1>
                            <p className="ga-doc-meta">
                                <Chip icon={<CalendarDays size={14} strokeWidth={2} aria-hidden="true" />}>
                                    Last updated · <span className="g-w">{doc.updated}</span>
                                </Chip>
                                <span>UNITY USA LLC · Rollout</span>
                            </p>
                            <Tricolore thin />
                        </header>

                        <div className="ga-prose">
                            {doc.body.map((section, i) => (
                                <section key={ids[i]} id={ids[i]} aria-labelledby={`${ids[i]}-h`}>
                                    <h2 id={`${ids[i]}-h`}>{section.heading}</h2>
                                    {section.paragraphs.map((p, j) => (
                                        <p key={j}>{p}</p>
                                    ))}
                                </section>
                            ))}
                        </div>

                        <footer className="ga-doc-foot">
                            <span>Rollout · UNITY USA LLC · Seattle WA</span>
                            <a href="mailto:legal@rollout.club">
                                <Mail size={16} strokeWidth={2} aria-hidden="true" />
                                legal@rollout.club
                            </a>
                        </footer>
                    </Card>
                </div>
            </div>
        </div>
    );
}
