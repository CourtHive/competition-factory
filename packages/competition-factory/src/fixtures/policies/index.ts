import { POLICY_ROUND_ROBIN_TALLY_DEFAULT } from './POLICY_ROUND_ROBIN_TALLY_DEFAULT';
import { POLICY_MATCHUP_ACTIONS_DEFAULT } from './POLICY_MATCHUP_ACTIONS_DEFAULT';
import { POLICY_PROGRESSION_DEFAULT } from './POLICY_PROGRESSION_DEFAULT';
import { POLICY_SANCTIONING_GENERIC } from './POLICY_SANCTIONING_GENERIC';
import { POLICY_DRAWS_DEFAULT } from './POLICY_DRAWS_DEFAULT';

import { POLICY_AVOIDANCE_COUNTRY } from './POLICY_AVOIDANCE_COUNTRY';

import { POLICY_COMPETITIVE_BANDS_DEFAULT } from './POLICY_COMPETITIVE_BANDS_DEFAULT';

import { POLICY_COMPETITION_PRESSURE } from './POLICY_COMPETITION_PRESSURE';
import { POLICY_COMPETITION_STANDARD } from './POLICY_COMPETITION_STANDARD';
import { POLICY_COMPETITION_SWISS } from './POLICY_COMPETITION_SWISS';

import { POLICY_POSITION_ACTIONS_UNRESTRICTED } from './POLICY_POSITION_ACTIONS_UNRESTRICTED';
import { POLICY_POSITION_ACTIONS_NO_MOVEMENT } from './POLICY_POSITION_ACTIONS_NO_MOVEMENT';
import { POLICY_POSITION_ACTIONS_DISABLED } from './POLICY_POSITION_ACTIONS_DISABLED';
import { POLICY_POSITION_ACTIONS_DEFAULT } from './POLICY_POSITION_ACTIONS_DEFAULT';

// The neutral ranking-points template. Organisation ranking-points policies are not bundled: the catalogue
// package (@courthive/competition-catalogue) publishes them, or a host serves its own.
import { POLICY_RANKING_POINTS_BASIC } from './POLICY_RANKING_POINTS_BASIC';
import { POLICY_LADDER_DEFAULT } from './POLICY_LADDER_DEFAULT';

import { POLICY_ROUND_NAMING_DEFAULT } from './POLICY_ROUND_NAMING_DEFAULT';
import { POLICY_SCHEDULING_DEFAULT } from './POLICY_SCHEDULING_DEFAULT';
import { POLICY_PRIVACY_DEFAULT } from './POLICY_PRIVACY_DEFAULT';
import { POLICY_PRIVACY_STAFF } from './POLICY_PRIVACY_STAFF';

import { POLICY_OFFICIATING_CONFLICT_OF_INTEREST } from './POLICY_OFFICIATING_CONFLICT_OF_INTEREST';

import { POLICY_SCORING_DEFAULT } from './POLICY_SCORING_DEFAULT';

import { POLICY_SEEDING_DEFAULT } from './POLICY_SEEDING_DEFAULT';
import { POLICY_SEEDING_BYES } from './POLICY_SEEDING_BYES';

import { POLICY_RATINGS_COMPETITION_FORM } from './POLICY_RATINGS_COMPETITION_FORM';
import { POLICY_RATINGS_DEFAULT } from './POLICY_RATINGS_DEFAULT';

import { POLICY_PRINT_DEFAULT } from './POLICY_PRINT_DEFAULT';

export const policies = {
  POLICY_AVOIDANCE_COUNTRY,

  // The only way for a consumer to obtain the default `deltaBands`, which the
  // signed-exposure APIs deliberately do NOT fall back to on their own.
  POLICY_COMPETITIVE_BANDS_DEFAULT,

  POLICY_COMPETITION_STANDARD,
  POLICY_COMPETITION_PRESSURE,
  POLICY_COMPETITION_SWISS,

  POLICY_RATINGS_DEFAULT,
  POLICY_RATINGS_COMPETITION_FORM,

  POLICY_POSITION_ACTIONS_DEFAULT,
  POLICY_POSITION_ACTIONS_DISABLED,
  POLICY_POSITION_ACTIONS_NO_MOVEMENT,
  POLICY_POSITION_ACTIONS_UNRESTRICTED,

  POLICY_PRIVACY_DEFAULT,
  // Exported so a provider can reference or extend the staff/tournamentContacts policy. It was
  // previously unreachable — hardcoded inside getTournamentInfo with no export and no caller override,
  // so "providers author their own privacy policies" was not true on this path.
  POLICY_PRIVACY_STAFF,

  POLICY_RANKING_POINTS_BASIC,
  POLICY_LADDER_DEFAULT,

  POLICY_ROUND_NAMING_DEFAULT,

  POLICY_SCHEDULING_DEFAULT,

  POLICY_SCORING_DEFAULT,

  POLICY_SEEDING_DEFAULT,
  POLICY_SEEDING_BYES,

  POLICY_OFFICIATING_CONFLICT_OF_INTEREST,

  // Exported 7.x. Each of these was documented as importable while being reachable by no public
  // path, so every example that used one silently produced `undefined` — which a policy parameter
  // reads as "none supplied", falling back to defaults without an error. See scripts/verify/docImports.mjs.
  POLICY_DRAWS_DEFAULT,
  POLICY_MATCHUP_ACTIONS_DEFAULT,
  POLICY_PROGRESSION_DEFAULT,

  POLICY_ROUND_ROBIN_TALLY_DEFAULT,

  // A bare SanctioningPolicy body, not policyDefinitions: pass it as `sanctioningPolicy`, or attach it as
  // `{ [POLICY_TYPE_SANCTIONING]: POLICY_SANCTIONING_GENERIC }`.
  POLICY_SANCTIONING_GENERIC,

  // deprecated: refused by `attachPolicies` (a name and no values) and read by nothing; removed in 8.0.0
  POLICY_PRINT_DEFAULT,
};
