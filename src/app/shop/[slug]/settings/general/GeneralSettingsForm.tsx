'use client';
import { useState, useTransition } from 'react';
import { updateShopGeneral } from './actions';

export function GeneralSettingsForm({
    shopId,
    slug,
    row,
}: {
    shopId: number;
    slug: string;
    row: any;
}) {
    const [pending, start] = useTransition();
    const [err, setErr] = useState<string | null>(null);
    const [ok, setOk] = useState(false);

    const [name, setName] = useState(row?.name ?? '');
    const [region, setRegion] = useState(row?.region ?? '');
    const [primary, setPrimary] = useState(row?.primary_color ?? '');
    const [secondary, setSecondary] = useState(row?.secondary_color ?? '');

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setErr(null);
        setOk(false);
        const fd = new FormData();
        fd.set('name', name);
        fd.set('region', region);
        fd.set('primary_color', primary);
        fd.set('secondary_color', secondary);
        start(async () => {
            try {
                await updateShopGeneral(shopId, slug, fd);
                setOk(true);
            } catch (e: any) {
                setErr(e?.message ?? 'Failed to save');
            }
        });
    };

    return (
        <form onSubmit={submit} className="admin-form" style={{ maxWidth: 560 }}>
            <div className="admin-form-label">SHOP NAME</div>
            <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="admin-form-input"
                placeholder="EMWRAPS"
            />

            <div className="admin-form-label">REGION</div>
            <input
                type="text"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="admin-form-input"
                placeholder="PNW"
            />

            <div className="admin-form-label">PRIMARY COLOR</div>
            <div
                style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    marginBottom: 12,
                }}
            >
                <input
                    type="text"
                    value={primary}
                    onChange={(e) => setPrimary(e.target.value)}
                    className="admin-form-input"
                    placeholder="#ffb733"
                    style={{ flex: 1, marginBottom: 0 }}
                />
                <div
                    style={{
                        width: 36,
                        height: 36,
                        border: '1px solid var(--line-mid)',
                        background: primary || 'transparent',
                    }}
                />
            </div>

            <div className="admin-form-label">SECONDARY COLOR</div>
            <div
                style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    marginBottom: 12,
                }}
            >
                <input
                    type="text"
                    value={secondary}
                    onChange={(e) => setSecondary(e.target.value)}
                    className="admin-form-input"
                    placeholder="#1a1a1a"
                    style={{ flex: 1, marginBottom: 0 }}
                />
                <div
                    style={{
                        width: 36,
                        height: 36,
                        border: '1px solid var(--line-mid)',
                        background: secondary || 'transparent',
                    }}
                />
            </div>

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
        </form>
    );
}
