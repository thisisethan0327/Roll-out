'use client';
import { useState, useTransition } from 'react';
import { updateShopEmail } from './actions';

export function EmailSettingsForm({
    shopId,
    slug,
    row,
    shopName,
}: {
    shopId: number;
    slug: string;
    row: any;
    shopName: string;
}) {
    const [pending, start] = useTransition();
    const [err, setErr] = useState<string | null>(null);
    const [ok, setOk] = useState(false);

    const [fromName, setFromName] = useState(row?.from_name ?? '');
    const [supportEmail, setSupportEmail] = useState(row?.support_email ?? '');
    const [logoUrl, setLogoUrl] = useState(row?.email_logo_url ?? '');
    const [signature, setSignature] = useState(row?.email_signature ?? '');

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setErr(null);
        setOk(false);
        const fd = new FormData();
        fd.set('from_name', fromName);
        fd.set('support_email', supportEmail);
        fd.set('email_logo_url', logoUrl);
        fd.set('email_signature', signature);
        start(async () => {
            try {
                await updateShopEmail(shopId, slug, fd);
                setOk(true);
            } catch (e: any) {
                setErr(e?.message ?? 'Failed to save');
            }
        });
    };

    const displayFrom = fromName.trim() || shopName;

    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) minmax(320px, 420px)',
                gap: 24,
                alignItems: 'start',
            }}
        >
            <form onSubmit={submit} className="admin-form">
                <div className="admin-form-label">FROM NAME</div>
                <input
                    type="text"
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                    className="admin-form-input"
                    placeholder={shopName}
                />
                <div
                    style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 10,
                        letterSpacing: 'var(--track-wider)',
                        color: 'var(--text-2)',
                        marginTop: -8,
                        marginBottom: 12,
                    }}
                >
                    DEFAULTS TO SHOP NAME WHEN BLANK.
                </div>

                <div className="admin-form-label">SUPPORT EMAIL (REPLY-TO)</div>
                <input
                    type="email"
                    value={supportEmail}
                    onChange={(e) => setSupportEmail(e.target.value)}
                    className="admin-form-input"
                    placeholder="hello@yourshop.com"
                    autoCapitalize="none"
                    autoCorrect="off"
                />

                <div className="admin-form-label">EMAIL LOGO URL</div>
                <input
                    type="text"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    className="admin-form-input"
                    placeholder="https://… (64px tall recommended)"
                />

                <div className="admin-form-label">EMAIL SIGNATURE</div>
                <textarea
                    value={signature}
                    onChange={(e) => setSignature(e.target.value)}
                    className="admin-form-input"
                    rows={4}
                    style={{ resize: 'vertical', minHeight: 84 }}
                    placeholder={'— The ' + shopName + ' crew\nSeattle, WA'}
                />

                {err && (
                    <div className="admin-login-error" style={{ padding: 8 }}>
                        {err}
                    </div>
                )}
                {ok && (
                    <div
                        style={{
                            padding: 8,
                            border: '1px solid var(--gold)',
                            background: 'var(--gold-glow)',
                            color: 'var(--gold)',
                            fontFamily: 'var(--font-display)',
                            fontSize: 11,
                            letterSpacing: 'var(--track-wide)',
                        }}
                    >
                        SAVED.
                    </div>
                )}
                <button
                    type="submit"
                    disabled={pending}
                    className="admin-form-btn"
                >
                    {pending ? 'SAVING…' : 'SAVE CHANGES'}
                </button>

                <div
                    style={{
                        marginTop: 24,
                        padding: 14,
                        border: '1px solid var(--line-mid)',
                        background: 'var(--bg-2)',
                        fontFamily: 'var(--font-display)',
                        fontSize: 11,
                        letterSpacing: 'var(--track-wide)',
                        color: 'var(--text-2)',
                    }}
                >
                    CUSTOM-DOMAIN SHOP EMAILS (SENDING FROM YOUR OWN
                    @YOURBRAND.COM) ARE A FUTURE FEATURE.
                </div>

                <div style={{ marginTop: 20 }}>
                    <div
                        style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: 11,
                            letterSpacing: 'var(--track-wider)',
                            color: 'var(--text-2)',
                            marginBottom: 8,
                        }}
                    >
                        TEMPLATES PREVIEWED
                    </div>
                    <div
                        style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
                    >
                        <span className="admin-pill">APPOINTMENT_ACCEPTED</span>
                        <span className="admin-pill">APPOINTMENT_DECLINED</span>
                        <span className="admin-pill">
                            TICKET_STATUS_CHANGED
                        </span>
                        <span className="admin-pill">RECEIPT</span>
                    </div>
                </div>
            </form>

            {/* Right side: email preview mimicking shellHtml */}
            <div
                style={{
                    border: '1px solid var(--line-mid)',
                    background: 'var(--bg-2)',
                    padding: 16,
                }}
            >
                <div
                    style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 11,
                        letterSpacing: 'var(--track-wider)',
                        color: 'var(--text-2)',
                        marginBottom: 12,
                    }}
                >
                    PREVIEW · APPOINTMENT_ACCEPTED
                </div>
                <div
                    style={{
                        background: '#000000',
                        color: '#ffffff',
                        padding: '24px 20px',
                        fontFamily:
                            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                        fontSize: 14,
                        lineHeight: 1.5,
                    }}
                >
                    {logoUrl ? (
                        <div
                            style={{
                                marginBottom: 16,
                                position: 'relative',
                                height: 32,
                            }}
                        >
                            <img
                                src={logoUrl}
                                alt={displayFrom}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    height: '100%',
                                    width: 'auto',
                                }}
                            />
                        </div>
                    ) : (
                        <div
                            style={{
                                marginBottom: 16,
                                fontFamily: 'var(--font-display)',
                                fontSize: 14,
                                letterSpacing: 'var(--track-wider)',
                                color: '#ffb733',
                                fontWeight: 700,
                            }}
                        >
                            {displayFrom.toUpperCase()}
                        </div>
                    )}
                    <div
                        style={{
                            color: '#ffb733',
                            fontSize: 11,
                            letterSpacing: '0.18em',
                            textTransform: 'uppercase',
                            marginBottom: 6,
                            fontFamily: 'var(--font-display)',
                        }}
                    >
                        Appointment Confirmed
                    </div>
                    <div
                        style={{
                            color: '#ffffff',
                            fontSize: 22,
                            fontWeight: 700,
                            marginBottom: 14,
                        }}
                    >
                        You&apos;re booked in.
                    </div>
                    <div style={{ color: '#cccccc', marginBottom: 12 }}>
                        Hi Sample Customer,
                    </div>
                    <div style={{ color: '#cccccc', marginBottom: 12 }}>
                        Your appointment with {displayFrom} has been confirmed
                        for Thursday, June 5 at 10:00 AM. We&apos;ll see you
                        then.
                    </div>
                    <div
                        style={{
                            color: '#888888',
                            fontSize: 12,
                            marginTop: 20,
                            whiteSpace: 'pre-wrap',
                            borderTop: '1px solid #222',
                            paddingTop: 12,
                        }}
                    >
                        {signature ||
                            `— The ${displayFrom} crew`}
                    </div>
                    {supportEmail && (
                        <div
                            style={{
                                color: '#666666',
                                fontSize: 10,
                                marginTop: 16,
                            }}
                        >
                            Reply to this email or write{' '}
                            <span style={{ color: '#ffb733' }}>
                                {supportEmail}
                            </span>
                            .
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
