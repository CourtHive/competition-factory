import { POLICY_RATINGS_ELO_WORLD_FOOTBALL } from './POLICY_RATINGS_ELO_WORLD_FOOTBALL';
import { POLICY_RATINGS_ELO_WELO_TENNIS } from './POLICY_RATINGS_ELO_WELO_TENNIS';
import { POLICY_RATINGS_ELO_538_TENNIS } from './POLICY_RATINGS_ELO_538_TENNIS';
import { POLICY_RATINGS_ELO_538_NHL } from './POLICY_RATINGS_ELO_538_NHL';
import { POLICY_RATINGS_FIFA_SUM } from './POLICY_RATINGS_FIFA_SUM';
import { POLICY_RATINGS_DEFAULT } from './POLICY_RATINGS_DEFAULT';

// constants and types
import { POLICY_TYPE_RATINGS } from '@Constants/policyConstants';
import type { RatingsPolicy } from '@Types/ratingsPolicyTypes';

/** The ratings presets by name, for a competitionFormat that selects one (`ratingsPolicy: 'POLICY_RATINGS_ELO_538_NHL'`). */
export const ratingsPolicies: Record<string, RatingsPolicy> = Object.fromEntries(
  Object.entries({
    POLICY_RATINGS_DEFAULT,
    POLICY_RATINGS_ELO_538_TENNIS,
    POLICY_RATINGS_ELO_WELO_TENNIS,
    POLICY_RATINGS_ELO_WORLD_FOOTBALL,
    POLICY_RATINGS_FIFA_SUM,
    POLICY_RATINGS_ELO_538_NHL,
  }).map(([name, definition]) => [name, definition[POLICY_TYPE_RATINGS]]),
);
