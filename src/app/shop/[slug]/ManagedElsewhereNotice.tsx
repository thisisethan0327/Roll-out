/**
 * "This shop manages X in its own admin" — the pointer shown wherever a page
 * has gone read-only because the shop runs its own console elsewhere.
 *
 * One component rather than a copy per page: the order DETAIL had this and the
 * orders LIST and the catalogue did not, so a member landing on the list saw
 * actions quietly missing with nothing to say where they went (run 11, lane F).
 * A dead end is worse than a refusal — the refusal at least names the door.
 */
export function ManagedElsewhereNotice({
    adminUrl,
    what,
}: {
    /** The shop's own admin, e.g. https://unityusa.co/admin */
    adminUrl: string;
    /** What is managed there, lowercase: 'orders', 'the catalogue'. */
    what: string;
}) {
    return (
        <div
            style={{
                border: '1px solid var(--line)',
                background: 'var(--bg-2)',
                padding: '10px 12px',
                marginBottom: 14,
                fontSize: 12,
                color: 'var(--text-2)',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                alignItems: 'center',
                justifyContent: 'space-between',
            }}
        >
            <span>
                This shop manages {what} in its own admin. This view is read-only.
            </span>
            <a
                href={adminUrl}
                target="_blank"
                rel="noreferrer"
                style={{ textDecoration: 'underline', color: 'var(--text)', whiteSpace: 'nowrap' }}
            >
                Open the admin
            </a>
        </div>
    );
}
