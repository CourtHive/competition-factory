import { TEMPLATE_RATINGS_ELO_WORLD_FOOTBALL } from './policies/TEMPLATE_RATINGS_ELO_WORLD_FOOTBALL';
import { TEMPLATE_RATINGS_ELO_WELO_TENNIS } from './policies/TEMPLATE_RATINGS_ELO_WELO_TENNIS';
import { TEMPLATE_RATINGS_ELO_538_TENNIS } from './policies/TEMPLATE_RATINGS_ELO_538_TENNIS';
import { TEMPLATE_RATINGS_ELO_538_NFL } from './policies/TEMPLATE_RATINGS_ELO_538_NFL';
import { TEMPLATE_RATINGS_ELO_538_NBA } from './policies/TEMPLATE_RATINGS_ELO_538_NBA';
import { TEMPLATE_RATINGS_WORLD_RUGBY } from './policies/TEMPLATE_RATINGS_WORLD_RUGBY';
import { TEMPLATE_RATINGS_ELO_538_NHL } from './policies/TEMPLATE_RATINGS_ELO_538_NHL';
import { TEMPLATE_RATINGS_FIFA_WOMEN } from './policies/TEMPLATE_RATINGS_FIFA_WOMEN';
import { TEMPLATE_RATINGS_FIFA_SUM } from './policies/TEMPLATE_RATINGS_FIFA_SUM';
import { TEMPLATE_RATINGS_FIVB } from './policies/TEMPLATE_RATINGS_FIVB';
import { POLICY_TYPE_RATINGS } from './constants';

// types
import type { RatingsPolicy } from '@Types/ratingsPolicyTypes';

/**
 * The ratings presets by name: each a bare ratings policy, for a `competitionFormat`'s `ratingsPolicy` or a
 * `generateDynamicRatings` call. Pass the object, not the name: `{ ratingsPolicy: ratingsPresets.TEMPLATE_RATINGS_FIVB }`.
 */
export const ratingsPresets: Record<string, RatingsPolicy> = Object.fromEntries(
  Object.entries({
    TEMPLATE_RATINGS_ELO_538_TENNIS,
    TEMPLATE_RATINGS_ELO_WELO_TENNIS,
    TEMPLATE_RATINGS_ELO_WORLD_FOOTBALL,
    TEMPLATE_RATINGS_FIFA_SUM,
    TEMPLATE_RATINGS_FIFA_WOMEN,
    TEMPLATE_RATINGS_ELO_538_NHL,
    TEMPLATE_RATINGS_ELO_538_NFL,
    TEMPLATE_RATINGS_ELO_538_NBA,
    TEMPLATE_RATINGS_WORLD_RUGBY,
    TEMPLATE_RATINGS_FIVB,
  }).map(([name, definition]) => [name, definition[POLICY_TYPE_RATINGS]]),
);
