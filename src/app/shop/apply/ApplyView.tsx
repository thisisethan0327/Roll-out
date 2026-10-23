/** /shop/apply in Glide: the diorama intro card beside the application form. */
import { ApplyForm } from './ApplyForm';
import { Card } from '@/components/glide/primitives';
import { AuthBar } from '@/components/glide-auth/AuthShell';

export function ApplyView({ withCommerce }: { withCommerce: boolean }) {
    return (
        <div className="glide glide-page ga-page">
            <div className="g-wrap">
                <AuthBar />
                <div className="ga-apply">
                    <Card edge className="ga-apply-intro">
                        <div className="g-door-im g-door-im--dio">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="g-only-light" src="/images/glide/door-shop-day.webp" alt="" />
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="g-only-dark" src="/images/glide/door-shop-night.webp" alt="" />
                        </div>
                        <div className="ga-apply-intro-bd">
                            <h1>{withCommerce ? 'Sell & list on Rollout' : 'Put your shop on Rollout'}</h1>
                            <p>
                                Tell us about your shop. A Rollout admin reviews every application before it goes live on the directory and
                                map. {withCommerce ? 'Selling on NeferStock needs a quick KYC — start it below.' : ''}
                            </p>
                        </div>
                    </Card>
                    <ApplyForm withCommerce={withCommerce} />
                </div>
            </div>
        </div>
    );
}
