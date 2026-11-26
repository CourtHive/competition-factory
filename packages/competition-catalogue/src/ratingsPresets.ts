import { POLICY_RATINGS_ELO_WORLD_FOOTBALL } from './policies/POLICY_RATINGS_ELO_WORLD_FOOTBALL';
import { POLICY_RATINGS_ELO_WELO_TENNIS } from './policies/POLICY_RATINGS_ELO_WELO_TENNIS';
import { POLICY_RATINGS_ELO_538_TENNIS } from './policies/POLICY_RATINGS_ELO_538_TENNIS';
import { POLICY_RATINGS_ELO_538_NFL } from './policies/POLICY_RATINGS_ELO_538_NFL';
import { POLICY_RATINGS_ELO_538_NBA } from './policies/POLICY_RATINGS_ELO_538_NBA';
import { POLICY_RATINGS_WORLD_RUGBY } from './policies/POLICY_RATINGS_WORLD_RUGBY';
import { POLICY_RATINGS_ELO_538_NHL } from './policies/POLICY_RATINGS_ELO_538_NHL';
import { POLICY_RATINGS_FIFA_WOMEN } from './policies/POLICY_RATINGS_FIFA_WOMEN';
import { POLICY_RATINGS_FIFA_SUM } from './policies/POLICY_RATINGS_FIFA_SUM';
import { POLICY_RATINGS_FIVB } from './policies/POLICY_RATINGS_FIVB';
import { POLICY_TYPE_RATINGS } from './constants';

// types
import type { RatingsPolicy } from '@Types/ratingsPolicyTypes';

/**
 * The ratings presets by name: each a bare ratings policy, for a `competitionFormat`'s `ratingsPolicy` or a
 * `generateDynamicRatings` call. Pass the object, not the name: `{ ratingsPolicy: ratingsPresets.POLICY_RATINGS_FIVB }`.
 */
export const ratingsPresets: Record<string, RatingsPolicy> = Object.fromEntries(
  Object.entries({
    POLICY_RATINGS_ELO_538_TENNIS,
    POLICY_RATINGS_ELO_WELO_TENNIS,
    POLICY_RATINGS_ELO_WORLD_FOOTBALL,
    POLICY_RATINGS_FIFA_SUM,
    POLICY_RATINGS_FIFA_WOMEN,
    POLICY_RATINGS_ELO_538_NHL,
    POLICY_RATINGS_ELO_538_NFL,
    POLICY_RATINGS_ELO_538_NBA,
    POLICY_RATINGS_WORLD_RUGBY,
    POLICY_RATINGS_FIVB,
  }).map(([name, definition]) => [name, definition[POLICY_TYPE_RATINGS]]),
);
