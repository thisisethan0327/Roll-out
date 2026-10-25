/** Skeleton for /me/garage, in the shape of the Glide page. */
import { Skeleton } from '@/components/feedback';
import { ConsoleHead } from '@/components/glide-console/parts';
import s from '@/components/glide-console/console.module.css';
import g from './garage.module.css';

export default function MyGarageLoading() {
    return (
        <div className={s.scope} aria-busy="true" aria-label="Loading your garage">
            <ConsoleHead title="Garage" />
            <ul className={g.cars}>
                {Array.from({ length: 3 }).map((_, i) => (
                    <li key={i}>
                        <section className={`g-card ${g.car}`}>
                            <Skeleton radius={20} style={{ aspectRatio: '16 / 10' }} />
                            <div className={g.body} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <Skeleton width="70%" height={20} radius={8} />
                                <Skeleton width="45%" height={12} radius={6} />
                            </div>
                        </section>
                    </li>
                ))}
            </ul>
        </div>
    );
}
