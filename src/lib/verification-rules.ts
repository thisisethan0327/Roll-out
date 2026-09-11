/**
 * Rollout event verification — rules v1.
 *
 * The six attestations a host makes when asking for verification
 * (RANK_SYSTEM_PLAN §7; request_event_verification stores them keyed by id
 * with rules_version 'v1'). Kept as code for now: there is no platform
 * settings table yet, so an admin edit means a deploy. When one lands, this
 * module becomes the fallback and the table wins.
 */
export const RULES_VERSION = 'v1';

export type RuleId =
    | 'host_standing'
    | 'venue_capacity'
    | 'run_rules_accepted'
    | 'insurance_moving'
    | 'artwork_url'
    | 'probation_ack';

export type Rule = {
    id: RuleId;
    title: string;
    text: string;
    /** 'check' = a checkbox attestation; 'artwork' = the coin PNG upload. */
    kind: 'check' | 'artwork';
};

export const RULES_V1: Rule[] = [
    {
        id: 'host_standing',
        title: 'Host in good standing',
        text: 'I am the host of this event (or a manager of the hosting shop), my account is not suspended, and I have no open moderation strikes.',
        kind: 'check',
    },
    {
        id: 'venue_capacity',
        title: 'Venue and capacity',
        text: 'The venue or route is real, I have the right to use it at the listed time, and the capacity on the event is the number of cars it can actually take.',
        kind: 'check',
    },
    {
        id: 'run_rules_accepted',
        title: 'Run rules',
        text: 'No street racing, no burnouts in the lot, no speed shared or recorded, posted limits on the route, and every attendee gets the rules before wheels roll.',
        kind: 'check',
    },
    {
        id: 'insurance_moving',
        title: 'Insurance for moving events',
        text: 'If this event moves (night run, cruise, track day), every driver carries current insurance and I will turn away anyone who cannot show it at the start.',
        kind: 'check',
    },
    {
        id: 'artwork_url',
        title: 'Coin artwork',
        text: 'A 1024 × 1024 PNG for the event coin. It is yours or licensed to you; Rollout may show it on the coin, the event page and the recap.',
        kind: 'artwork',
    },
    {
        id: 'probation_ack',
        title: 'New-host probation',
        text: 'Until I have completed three verified events, the coin cap on each is 40, whatever cap I ask for.',
        kind: 'check',
    },
];

export const CHECK_RULES = RULES_V1.filter((r) => r.kind === 'check');
