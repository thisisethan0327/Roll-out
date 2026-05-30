import Link from 'next/link';

export function SiteFooter() {
    const year = new Date().getFullYear();
    return (
        <footer
            style={{
                borderTop: '1px solid var(--line)',
                background: 'var(--bg-1)',
                padding: '48px 0 32px',
                marginTop: 80,
            }}
        >
            <div className="container">
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: 40,
                        paddingBottom: 36,
                        borderBottom: '1px solid var(--line)',
                    }}
                >
                    <div>
                        <div className="font-display" style={{ fontWeight: 700, letterSpacing: 4, fontSize: 18 }}>
                            ROLLOUT
                        </div>
                        <div className="text-jp" style={{ fontSize: 9, letterSpacing: 2, marginTop: 2 }}>
                            ／ ロールアウト
                        </div>
                        <p className="text-muted" style={{ fontSize: 12, marginTop: 16, lineHeight: 1.6 }}>
                            A private network for the cars you build.
                            <br />Shops · Meets · Builds.
                        </p>
                    </div>

                    <FooterColumn title="Product">
                        <Link href="/meets">Meets</Link>
                        <Link href="/#features">Features</Link>
                        <Link href="/#download">Download</Link>
                        <Link href="/sign-in-on-phone">Sign-in help</Link>
                    </FooterColumn>

                    <FooterColumn title="Company">
                        <Link href="/help">Help center</Link>
                        <a href="mailto:team@rollout.club">Contact</a>
                        <a href="mailto:support@rollout.club">Report a problem</a>
                    </FooterColumn>

                    <FooterColumn title="Legal">
                        <Link href="/terms">Terms of Service</Link>
                        <Link href="/privacy">Privacy Policy</Link>
                        <Link href="/guidelines">Community Guidelines</Link>
                    </FooterColumn>
                </div>

                <div className="mono-row" style={{ marginTop: 24, justifyContent: 'space-between', display: 'flex', width: '100%', fontSize: 10 }}>
                    <span>ROLLOUT · UNITY USA LLC · SEATTLE WA</span>
                    <span>© {year} UNITY USA LLC</span>
                </div>
            </div>
        </footer>
    );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <div className="eyebrow" style={{ marginBottom: 16 }}>{title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {Array.isArray(children) ? children.map((c, i) => (
                    <div key={i} style={{ fontSize: 13 }}>{c}</div>
                )) : <div style={{ fontSize: 13 }}>{children}</div>}
            </div>
        </div>
    );
}
