import { POLICY_COMPETITIVE_BANDS_DEFAULT } from './POLICY_COMPETITIVE_BANDS_DEFAULT';
import { POLICY_MATCHUP_ACTIONS_DEFAULT } from './POLICY_MATCHUP_ACTIONS_DEFAULT';
import { POLICY_POSITION_ACTIONS_DEFAULT } from './POLICY_POSITION_ACTIONS_DEFAULT';
import { POLICY_RATINGS_COMPETITION_FORM } from './POLICY_RATINGS_COMPETITION_FORM';
import { POLICY_ROUND_NAMING_DEFAULT } from './POLICY_ROUND_NAMING_DEFAULT';
import { POLICY_SCHEDULING_DEFAULT } from './POLICY_SCHEDULING_DEFAULT';
import { POLICY_RATINGS_DEFAULT } from './POLICY_RATINGS_DEFAULT';
import { POLICY_SEEDING_DEFAULT } from './POLICY_SEEDING_DEFAULT';
import { POLICY_LADDER_DEFAULT } from './POLICY_LADDER_DEFAULT';
import { POLICY_PRIVACY_STAFF } from './POLICY_PRIVACY_STAFF';

// constants
import {
  POLICY_TYPE_COMPETITIVE_BANDS,
  POLICY_TYPE_MATCHUP_ACTIONS,
  POLICY_TYPE_POSITION_ACTIONS,
  POLICY_TYPE_ROUND_NAMING,
  POLICY_TYPE_PARTICIPANT,
  POLICY_TYPE_SCHEDULING,
  POLICY_TYPE_RATINGS,
  POLICY_TYPE_SEEDING,
  POLICY_TYPE_LADDER,
} from '@Constants/policyConstants';

/**
 * The policies the engine itself falls back to when neither the record nor the caller supplies one, by policy type:
 * a runtime reader outside `src/fixtures/` imports each of them as its default. They are what a record that pins no
 * policy of a type relies on, and what `defaultsHash` identifies.
 *
 * The provider-neutral presets the engine never reads (`POLICY_DRAWS_DEFAULT`, `POLICY_PROGRESSION_DEFAULT`,
 * `POLICY_PRIVACY_DEFAULT` and the like) are not listed: changing one changes no engine behaviour for a record that
 * pins nothing. `ratings` has two fallbacks, the dynamic-ratings default and the competition form rating.
 *
 * Read only by `scripts/generateDefaultsHash.mjs` and the tests. Nothing at runtime imports it, so the defaults are not
 * pulled into a bundle by the stamp.
 */
export const ENGINE_DEFAULT_POLICIES: {
  [policyType: string]: { [fixtureName: string]: { [policyType: string]: unknown } };
} = {
  [POLICY_TYPE_COMPETITIVE_BANDS]: { POLICY_COMPETITIVE_BANDS_DEFAULT },
  [POLICY_TYPE_LADDER]: { POLICY_LADDER_DEFAULT },
  [POLICY_TYPE_MATCHUP_ACTIONS]: { POLICY_MATCHUP_ACTIONS_DEFAULT },
  [POLICY_TYPE_POSITION_ACTIONS]: { POLICY_POSITION_ACTIONS_DEFAULT },
  [POLICY_TYPE_PARTICIPANT]: { POLICY_PRIVACY_STAFF },
  [POLICY_TYPE_RATINGS]: { POLICY_RATINGS_COMPETITION_FORM, POLICY_RATINGS_DEFAULT },
  [POLICY_TYPE_ROUND_NAMING]: { POLICY_ROUND_NAMING_DEFAULT },
  [POLICY_TYPE_SCHEDULING]: { POLICY_SCHEDULING_DEFAULT },
  [POLICY_TYPE_SEEDING]: { POLICY_SEEDING_DEFAULT },
};

/**
 * What a policy type's hash is taken over: the definition itself when the type has one fallback (so a caller can hash a
 * policy it holds and compare it with `defaultsHashes`), and the definitions keyed by fixture name when it has several.
 */
export function engineDefaultHashInput(policyType: string): unknown {
  const fixtures = ENGINE_DEFAULT_POLICIES[policyType];
  const names = Object.keys(fixtures ?? {});
  const definitionOf = (name: string) => fixtures[name]?.[policyType];
  if (names.length === 1) return definitionOf(names[0]);
  return Object.fromEntries(names.map((name) => [name, definitionOf(name)]));
}
