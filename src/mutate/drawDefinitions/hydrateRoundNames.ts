import { getMappedStructureMatchUps, getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { getRoundContextProfile } from '@Query/matchUps/getRoundContextProfile';

// constants
import { POLICY_TYPE_ROUND_NAMING } from '@Constants/policyConstants';

export function hydrateRoundNames(params) {
  const { drawDefinition, appliedPolicies } = params;
  const roundNamingPolicy = appliedPolicies?.[POLICY_TYPE_ROUND_NAMING];
  const matchUpsMap = getMatchUpsMap({ drawDefinition });
  drawDefinition.structures?.forEach((structure) => {
    const matchUps = getMappedStructureMatchUps({
      structureId: structure.structureId,
      matchUpsMap,
    });
    const result = getRoundContextProfile({
      roundNamingPolicy,
      drawDefinition,
      structure,
      matchUps,
    });
    const { roundNamingProfile, roundProfile } = result;

    // account for structures within structures (round robins)
    const structures = structure.structures || [structure];
    structures.forEach((itemStructure) => {
      (itemStructure.matchUps ?? []).forEach((matchUp) => {
        const roundNumber = matchUp?.roundNumber?.toString();
        if (roundNumber) {
          const roundName = roundNamingProfile?.[roundNumber]?.roundName;
          const abbreviatedRoundName = roundNamingProfile?.[roundNumber]?.abbreviatedRoundName;
          const feedRound = roundProfile?.[roundNumber]?.feedRound;
          Object.assign(matchUp, {
            abbreviatedRoundName,
            feedRound,
            roundName,
          });
        }
      });
    });
  });

  return { drawDefinition };
}
