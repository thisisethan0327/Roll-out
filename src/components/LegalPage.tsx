import { LEGAL, type LegalDoc } from '@/lib/legal';

type DocKey = keyof typeof LEGAL;

export function LegalPage({ docKey }: { docKey: DocKey }) {
    const doc: LegalDoc = LEGAL[docKey];

    return (
        <div className="legal">
            <div className="container container-narrow">
                <div className="eyebrow eyebrow-gold mb-4">
                    ／ {docKey === 'terms' ? 'TERMS' : docKey === 'privacy' ? 'PRIVACY' : 'GUIDELINES'}
                </div>
                <h1>{doc.title}</h1>
                <div className="meta">
                    LAST UPDATED · {doc.updated} ／ UNITY USA LLC · ROLLOUT
                </div>

                {doc.body.map((section, i) => (
                    <section key={i}>
                        <h2>{section.heading}</h2>
                        {section.paragraphs.map((p, j) => (
                            <p key={j}>{p}</p>
                        ))}
                    </section>
                ))}

                <div
                    style={{
                        marginTop: 64,
                        paddingTop: 32,
                        borderTop: '1px solid var(--line)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 16,
                    }}
                    className="mono-row"
                >
                    <span>ROLLOUT · UNITY USA LLC · SEATTLE WA</span>
                    <a href="mailto:legal@rollout.club" className="text-gold">
                        legal@rollout.club
                    </a>
                </div>
            </div>
        </div>
    );
}
