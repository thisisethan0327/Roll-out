'use client';
import { useState, useTransition } from 'react';
import { updateShopEmail } from './actions';
import { Eye, Globe, Mail } from 'lucide-react';
import { GlideButton } from '@/components/glide/primitives';
import { CardHead, Field, FormSection } from '@/components/glide-console/parts';
import cs from '@/components/glide-console/console.module.css';
import { Notice, cx } from '@/components/glide-shopbiz/parts';
import bz from '@/components/glide-shopbiz/biz.module.css';

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
    const inp = cx(cs.input, bz.in);

    return (
        <div className={cx(bz.split, bz.splitWide)}>
            <form onSubmit={submit} className={cs.col}>
                <FormSection id="em-sender" title="Sender" edge>
                    <Field label="From name" htmlFor="em-from" hint="Defaults to the shop name when blank.">
                        <input id="em-from" type="text" value={fromName} onChange={(e) => setFromName(e.target.value)} className={inp} placeholder={shopName} />
                    </Field>
                    <Field label="Support email (reply-to)" htmlFor="em-support">
                        <input
                            id="em-support"
                            type="email"
                            value={supportEmail}
                            onChange={(e) => setSupportEmail(e.target.value)}
                            className={inp}
                            placeholder="hello@yourshop.com"
                            autoCapitalize="none"
                            autoCorrect="off"
                        />
                    </Field>
                    <Field label="Email logo URL" htmlFor="em-logo" hint="64 px tall works best.">
                        <input id="em-logo" type="text" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className={inp} placeholder="https://…" />
                    </Field>
                    <Field label="Email signature" htmlFor="em-sig">
                        <textarea
                            id="em-sig"
                            value={signature}
                            onChange={(e) => setSignature(e.target.value)}
                            className={inp}
                            rows={4}
                            placeholder={'— The ' + shopName + ' crew'}
                        />
                    </Field>
                </FormSection>

                {err && (
                    <Notice tone="bad" live>
                        {err}
                    </Notice>
                )}
                {ok && (
                    <Notice tone="ok" live>
                        Saved.
                    </Notice>
                )}
                <div>
                    <GlideButton type="submit" disabled={pending} aria-busy={pending}>
                        {pending ? 'Saving…' : 'Save changes'}
                    </GlideButton>
                </div>

                <Notice icon={<Globe size={20} strokeWidth={2} aria-hidden="true" />}>
                    Custom-domain shop emails (sending from your own @yourbrand.com) are a future feature.
                </Notice>

                <section className="g-card" aria-labelledby="em-tpl-h">
                    <CardHead id="em-tpl-h" title="Templates previewed" />
                    <div className={cs.cardBody}>
                        <div className="g-chips">
                            <span className="g-chip">
                                <Mail size={14} strokeWidth={2} aria-hidden="true" />
                                Appointment accepted
                            </span>
                            <span className="g-chip">
                                <Mail size={14} strokeWidth={2} aria-hidden="true" />
                                Appointment declined
                            </span>
                            <span className="g-chip">
                                <Mail size={14} strokeWidth={2} aria-hidden="true" />
                                Ticket status changed
                            </span>
                            <span className="g-chip">
                                <Mail size={14} strokeWidth={2} aria-hidden="true" />
                                Receipt
                            </span>
                        </div>
                    </div>
                </section>
            </form>

            {/* Right side: email preview mimicking shellHtml. The message
                keeps the email's own palette (it is what the customer
                receives), only its frame is Glide. */}
            <aside className={cx('g-card', cs.sticky)} aria-labelledby="em-prev-h">
                <div className={cs.cardBody} style={{ paddingTop: 20, paddingBottom: 26 }}>
                    <h2 id="em-prev-h" className={bz.prevH}>
                        <Eye size={16} strokeWidth={2} aria-hidden="true" />
                        Preview · Appointment accepted
                    </h2>
                    <div className={bz.mail}>
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
                                color: '#a0a0a0',
                                fontSize: 12,
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
            </aside>
        </div>
    );
}
