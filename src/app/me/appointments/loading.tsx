/** Skeleton for /me/appointments, in the shape of the Glide page. */
import { Skeleton, SkeletonText } from '@/components/feedback';
import { ConsoleHead } from '@/components/glide-console/parts';
import s from '@/components/glide-console/console.module.css';
import a from './appointments.module.css';

export default function MyAppointmentsLoading() {
    return (
        <div className={s.scope} aria-busy="true" aria-label="Loading your appointments">
            <ConsoleHead title="Appointments" sub="Your booking requests across every Rollout shop." />
            <ul className={a.list}>
                {Array.from({ length: 4 }).map((_, i) => (
                    <li key={i}>
                        <section className={`g-card ${a.appt}`}>
                            <Skeleton width="55%" height={20} radius={8} />
                            <div style={{ marginTop: 12 }}>
                                <SkeletonText lines={2} />
                            </div>
                            <Skeleton height={44} radius={22} style={{ marginTop: 18 }} />
                        </section>
                    </li>
                ))}
            </ul>
        </div>
    );
}
