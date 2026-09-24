/**
 * Cover Story B — tear-off coupon shell around the RSVP/ticket controls.
 * Wraps whatever RSVP UI the page passes in (TiersSection for tiered/paid
 * events, or RsvpControls + MyTicketsPanel for free events) — no RSVP logic
 * lives here, purely the coupon frame (corner notches + cut line + eyebrow).
 */
import styles from './cover-story.module.css';

export function TicketCard({ children }: { children: React.ReactNode }) {
    return (
        <div className={styles.ticketWrap}>
            <div className={styles.ticketCoupon}>
                <div className={styles.cutLineLabel}>
                    <span>✂ CUT HERE</span>
                </div>
                <hr className={styles.cutLine} />
                {children}
            </div>
        </div>
    );
}
