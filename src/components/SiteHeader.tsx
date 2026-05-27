import Link from 'next/link';

export function SiteHeader() {
    return (
        <header
            style={{
                position: 'sticky',
                top: 0,
                zIndex: 50,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                background: 'rgba(0,0,0,0.7)',
                borderBottom: '1px solid var(--line)',
            }}
        >
            <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
                <Link href="/" style={{ display: 'flex', flexDirection: 'column', textDecoration: 'none' }}>
                    <span className="font-display" style={{ fontWeight: 700, letterSpacing: 4, color: 'var(--text)', fontSize: 18 }}>
                        ROLLOUT
                    </span>
                    <span className="text-jp" style={{ fontSize: 9, letterSpacing: 2, marginTop: 1 }}>
                        ／ ロールアウト
                    </span>
                </Link>

                <nav className="flex items-center gap-6" style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: 'var(--track-wider)' }}>
                    <Link href="/#features" className="text-dim" style={{ textTransform: 'uppercase' }}>
                        Features
                    </Link>
                    <Link href="/help" className="text-dim" style={{ textTransform: 'uppercase' }}>
                        Help
                    </Link>
                    <Link href="/#download" className="btn" style={{ padding: '10px 20px', fontSize: 11 }}>
                        Get The App
                    </Link>
                </nav>
            </div>
        </header>
    );
}
