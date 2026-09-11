import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';

import POLICY_COMPETITIVE_BANDS_DEFAULT from '@Fixtures/policies/POLICY_COMPETITIVE_BANDS_DEFAULT';
import { POLICY_TYPE_COMPETITIVE_BANDS } from '@Constants/policyConstants';
import { PolicyDefinitions } from '@Types/factoryTypes';
import { DeltaBand } from './resolveDeltaBand';
import { DrawDefinition, Event, Structure, Tournament } from '@Types/tournamentTypes';

type ResolveCompetitiveBandsArgs = {
  policyDefinitions?: PolicyDefinitions;
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  structure?: Structure;
  event?: Event;
};

export function resolveCompetitiveBands({
  policyDefinitions,
  tournamentRecord,
  drawDefinition,
  structure,
  event,
}: ResolveCompetitiveBandsArgs) {
  const explicit = policyDefinitions?.[POLICY_TYPE_COMPETITIVE_BANDS];
  if (explicit?.profileBands) return explicit.profileBands;

  if (tournamentRecord) {
    const { appliedPolicies } = getAppliedPolicies({
      tournamentRecord,
      drawDefinition,
      structure,
      event,
    });
    const applied = appliedPolicies?.[POLICY_TYPE_COMPETITIVE_BANDS];
    if (applied?.profileBands) return applied.profileBands;
  }

  return POLICY_COMPETITIVE_BANDS_DEFAULT[POLICY_TYPE_COMPETITIVE_BANDS].profileBands;
}

/**
 * The SIGNED exposure axis's `deltaBands`, resolved explicit-argument first,
 * then from applied policies (event -> draw -> tournament scope).
 *
 * Deliberately asymmetric with `resolveCompetitiveBands` above: there is NO
 * fixture fallback. A caller that has not opted into `deltaBands` gets no
 * bands, and the signed APIs then return the delta with no band rather than a
 * guessed default. The realized thresholds (20/50) are long-standing and
 * load-bearing for existing consumers; the default delta boundaries are an
 * explicitly arbitrary cut taken from one corpus, so stamping band labels
 * derived from them onto everybody's data would be asserting something we have
 * not established. Opting in is one import:
 * `POLICY_COMPETITIVE_BANDS_DEFAULT`, via `fixtures.policies`.
 */
export function resolveDeltaBands({
  policyDefinitions,
  tournamentRecord,
  drawDefinition,
  structure,
  event,
}: ResolveCompetitiveBandsArgs): DeltaBand[] | undefined {
  const explicit = policyDefinitions?.[POLICY_TYPE_COMPETITIVE_BANDS];
  if (explicit?.deltaBands) return explicit.deltaBands;

  if (tournamentRecord) {
    const { appliedPolicies } = getAppliedPolicies({
      tournamentRecord,
      drawDefinition,
      structure,
      event,
    });
    const applied = appliedPolicies?.[POLICY_TYPE_COMPETITIVE_BANDS];
    if (applied?.deltaBands) return applied.deltaBands;
  }

  return undefined;
}
