/** Streaming skeleton for /store — title, shop chips and one shelf of cards. */
import { Skel } from '@/components/glide-tickets/parts';

export default function StoreLoading() {
    return (
        <div className="glide glide-page">
            <div className="g-wrap gt-page" aria-busy="true">
                <div className="gt-head">
                    <div className="gt-head-t">
                        <Skel w="min(240px, 60%)" h={42} />
                        <Skel w="min(520px, 90%)" h={16} style={{ marginTop: 14 }} />
                    </div>
                    <Skel w={112} h={48} r={24} />
                </div>
                <div className="gt-fchips">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skel key={i} w={110} h={44} r={22} />
                    ))}
                </div>
                <Skel w={220} h={24} style={{ marginBottom: 14 }} />
                <ul className="gt-grid">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <li key={i} className="gt-pc">
                            <Skel h={undefined} r={19} style={{ aspectRatio: '1 / 1' }} />
                            <Skel w="75%" h={15} style={{ margin: '14px 10px 0' }} />
                            <Skel w={64} h={13} style={{ margin: '8px 10px 0' }} />
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
