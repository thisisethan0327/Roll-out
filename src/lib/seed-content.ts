/**
 * Preview seed content that lives in the production rollout schema.
 *
 * The 2026-09-10 preview seed inserted member personas and the meets they
 * host so the signed-out preview had a community to show. Those rows carry no
 * marker column — the seed's manifest (kept with the seed plan, outside this
 * repo) is the only record of them — so their ids are listed here. Later seed
 * plans mark their rows with a 'seed' tag, and jump search already skips
 * '[SEED]' titles; both are recognised too.
 *
 * Search engines must not be told these are real: a seed meet gets no Event
 * markup, no sitemap entry and a noindex, and a seed persona's profile is
 * noindexed (SEO review 2026-10-01). Purging the seed makes this list inert.
 */

/** events.id rows inserted by the 2026-09-10 preview seed. */
const SEED_EVENT_IDS = new Set([
    '7680f752-3216-4e16-9bb0-57b36f05948c',
    '28011497-b5de-4e41-8d23-8386dbbfd1be',
    '8d37a1b8-3b24-4087-9bde-e197be43f106',
    '435dba77-da99-4c19-a2ef-2fa9e2162262',
    'df1a4083-e59e-4d46-8694-f80963f69e9e',
    '254a890e-90f5-4bde-96f7-ebc05405dd02',
]);

/** profiles.id rows (member personas) inserted by the 2026-09-10 preview seed. */
const SEED_PROFILE_IDS = new Set([
    '894815a6-4484-410b-b1f8-3ef0cb2d4777',
    '2e964e09-b6d8-4742-a7cc-d2c05ad97e04',
    'f76c79cc-fdb4-48f5-a4ad-463ba93f4843',
    '57efb224-1aeb-42fa-8c6b-2862a2803dd3',
    '3f92a09c-e9a0-4fe3-a1bf-3f6585b65226',
    'b26b4d3e-7e3c-44a2-9afe-4d15c8c4b136',
    '4e650843-640d-4e77-9273-dbf450d211f8',
    '7f56e7c3-b912-4b56-ba7d-ad13acc7460b',
    'ae7a6327-4596-4f9e-b06f-816f1d0401be',
    '44cd053d-d81c-4274-9cb2-3b435acc6b70',
    'd7845c77-3051-4487-b77b-8d5002d3352b',
    '1fde5ab6-573b-4bb8-aa14-a7cfb1261cea',
    '934a6990-7bd7-4121-957b-c175e3723d59',
    '60cfb9dd-645c-4a55-a5e4-7f208a11e312',
    '1cddd54c-6929-494a-9a04-6de0fe92d8d7',
    'eda8765a-a1e8-4fb5-978a-d2fbe15f506f',
    '7edb8cae-bb08-4630-8cf6-341f635f77d6',
    '8062cd92-4b42-4fcb-9296-601426de111d',
    '8d5d57a0-7979-4360-b061-7d3919b89a37',
    '68d1df3f-c799-46c6-a74a-e01b58a60267',
    '0587f3e7-4c39-4942-8ef8-1d06b1cc8de2',
    'bb53b759-bb46-460d-94c6-bf39033024d5',
    '9438bc95-a2aa-48ca-8f97-1ac733e3478f',
    '4a12665c-a5a2-4b32-825d-cc0f53069678',
]);

/** True for a seed persona's profile. */
export function isSeedProfile(profileId: string | null | undefined): boolean {
    return !!profileId && SEED_PROFILE_IDS.has(profileId);
}

/** True for a seed meet: listed above, hosted by a seed persona, tagged 'seed', or titled '[SEED] …'. */
export function isSeedEvent(ev: {
    id: string;
    host_id?: string | null;
    tags?: string[] | null;
    title?: string | null;
}): boolean {
    return (
        SEED_EVENT_IDS.has(ev.id) ||
        isSeedProfile(ev.host_id) ||
        (ev.tags ?? []).some((t) => t.toLowerCase() === 'seed') ||
        /^\[seed\]/i.test(ev.title ?? '')
    );
}
