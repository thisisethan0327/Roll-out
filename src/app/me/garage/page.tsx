/**
 * /me/garage — read view of the member's rollout.vehicles plus their public
 * posts. Editing lives in the mobile app; this surface links out. Scoped to the
 * caller's profile id via the service-role admin client (explicit owner filter).
 *
 * Glide (board: G4 garage and You): car cards with the photo first, the name in
 * Chakra Petch, specs as chips and the lead car on the tricolore edge; posts as
 * rows. Same loaders.
 */
import { Car, Gauge, Heart, Lock, MessageCircle, Smartphone, Tag, UserRound, Wrench } from 'lucide-react';
import { requireConsumer } from '@/lib/me-guard';
import { loadMyGarage, loadMyPosts } from '@/lib/me-data';
import { fmtDay } from '../ui';
import { Card, Chip, SecButton } from '@/components/glide/primitives';
import { CardHead, ConsoleHead, Empty } from '@/components/glide-console/parts';
import s from '@/components/glide-console/console.module.css';
import g from './garage.module.css';

export const dynamic = 'force-dynamic';

function sentence(v: string): string {
    const t = v.replace(/[_-]+/g, ' ').trim().toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
}

export default async function GaragePage() {
    const profile = await requireConsumer('/me/garage');
    const [vehicles, posts] = await Promise.all([loadMyGarage(profile.profileId), loadMyPosts(profile.profileId)]);
    const chipIc = { size: 14, strokeWidth: 2, 'aria-hidden': true } as const;

    return (
        <div className={s.scope}>
            <ConsoleHead
                title="Garage"
                sub="Your builds and posts. Editing lives in the Rollout app."
                actions={
                    <SecButton href={`/u/${profile.handle}`}>
                        <UserRound size={17} strokeWidth={2} aria-hidden="true" />
                        Public profile
                    </SecButton>
                }
            />

            <section aria-labelledby="cars-h">
                <h2 id="cars-h" className="g-sr">
                    Vehicles
                </h2>
                {vehicles.length === 0 ? (
                    <Card>
                        <Empty
                            icon={<Car size={22} strokeWidth={1.75} />}
                            title="No cars in your garage yet"
                        />
                    </Card>
                ) : (
                    <ul className={g.cars}>
                        {vehicles.map((v, i) => {
                            const name = [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle';
                            return (
                                <li key={v.id}>
                                    <Card as="article" edge={i === 0} className={g.car} aria-label={name}>
                                        <div className={g.photo} style={v.hero_image_url ? { backgroundImage: `url(${v.hero_image_url})` } : undefined}>
                                            {v.hero_image_url ? null : <Car className={g.noPhoto} size={40} strokeWidth={1.25} aria-hidden="true" />}
                                            {v.garage_number ? (
                                                <span className={`g-fp ${g.bay}`}>
                                                    <span className="g-w">#{v.garage_number}</span>
                                                </span>
                                            ) : null}
                                        </div>
                                        <div className={g.body}>
                                            <h3 className={g.name}>{name}</h3>
                                            <p className={g.sub}>{[v.trim, v.color].filter(Boolean).join(' · ') || '—'}</p>
                                            {v.engine || v.hp || v.build_stage || (v.visibility && v.visibility !== 'public') ? (
                                                <div className="g-chips" style={{ marginTop: 12 }}>
                                                    {v.engine ? <Chip icon={<Wrench {...chipIc} />}>{v.engine}</Chip> : null}
                                                    {v.hp ? (
                                                        <Chip icon={<Gauge {...chipIc} />}>
                                                            <span className="g-w">{v.hp}</span> hp
                                                        </Chip>
                                                    ) : null}
                                                    {v.build_stage ? (
                                                        <Chip tint icon={<Tag {...chipIc} />}>
                                                            {sentence(v.build_stage)}
                                                        </Chip>
                                                    ) : null}
                                                    {v.visibility && v.visibility !== 'public' ? <Chip icon={<Lock {...chipIc} />}>{sentence(v.visibility)}</Chip> : null}
                                                </div>
                                            ) : null}
                                        </div>
                                    </Card>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            <Card as="section" aria-labelledby="posts-h">
                <CardHead id="posts-h" title="My posts" sub={posts.length > 0 ? `${posts.length} ${posts.length === 1 ? 'post' : 'posts'}` : undefined} />
                {posts.length === 0 ? (
                    <Empty
                        icon={<Smartphone size={22} strokeWidth={1.75} />}
                        title="No posts yet"
                    />
                ) : (
                    <ul className={`g-rows ${s.cardRows}`}>
                        {posts.map((p) => (
                            <li key={p.id} className={`g-row ${g.post}`}>
                                {p.hero_image_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img className={g.postIm} src={p.hero_image_url} alt="" loading="lazy" />
                                ) : (
                                    <span className={`${g.postIm} ${g.postNone}`} aria-hidden="true">
                                        <MessageCircle size={20} strokeWidth={1.75} />
                                    </span>
                                )}
                                <span className="g-row-t">
                                    <small className={g.postMeta}>
                                        {sentence(String(p.type ?? 'post'))} · {fmtDay(p.created_at)}
                                    </small>
                                    {p.body ? <b className={g.postBody}>{p.body}</b> : null}
                                </span>
                                <span className={g.postStats}>
                                    <span aria-label={`${p.like_count ?? 0} likes`}>
                                        <Heart size={15} strokeWidth={2} aria-hidden="true" />
                                        <span className="g-w">{p.like_count ?? 0}</span>
                                    </span>
                                    <span aria-label={`${p.comment_count ?? 0} comments`}>
                                        <MessageCircle size={15} strokeWidth={2} aria-hidden="true" />
                                        <span className="g-w">{p.comment_count ?? 0}</span>
                                    </span>
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>
        </div>
    );
}
