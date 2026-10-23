import { ExternalLink, Lock } from 'lucide-react';
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
    // Glide notice: the read-only state says where the actions went. The
    // link is the way out, so it is a real 44px target.
    return (
        <div className="g-note" style={{ flexWrap: 'wrap', justifyContent: 'space-between', fontWeight: 500 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <Lock size={20} strokeWidth={2} aria-hidden="true" />
                <span>This shop manages {what} in its own admin. This view is read-only.</span>
            </span>
            <a href={adminUrl} target="_blank" rel="noreferrer" className="g-link" style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>
                Open the admin
                <ExternalLink size={16} strokeWidth={2} aria-hidden="true" />
            </a>
        </div>
    );
}
