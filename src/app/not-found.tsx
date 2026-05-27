import Link from 'next/link';

export default function NotFound() {
    return (
        <div className="legal">
            <div className="container container-narrow" style={{ textAlign: 'center', paddingTop: 80 }}>
                <div className="eyebrow eyebrow-gold mb-4">／ SIGNAL LOST</div>
                <h1 style={{ marginBottom: 12 }}>404</h1>
                <p className="text-dim" style={{ fontSize: 17, marginBottom: 40 }}>
                    This sector doesn&apos;t exist. Try the home page or the help center.
                </p>
                <Link href="/" className="btn">
                    Back to base
                </Link>
            </div>
        </div>
    );
}
