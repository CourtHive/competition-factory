import { getPolicyDefinitions } from '@Query/extensions/getAppliedPolicies';
import { getAwardProfile } from '@Query/scales/getAwardProfile';
import { findEvent } from '@Acquire/findEvent';

// constants and types
import { MISSING_POLICY_DEFINITION, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { QUALIFYING, MAIN } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { PolicyDefinitions } from '@Types/factoryTypes';
import { Tournament } from '@Types/tournamentTypes';

type GetApplicableAwardProfileLevelsArgs = {
  policyDefinitions?: PolicyDefinitions;
  tournamentRecord: Tournament;
  eventId?: string;
  drawId?: string;
};

// Stages and participation orders to probe when checking level applicability.
// A draw can produce points in MAIN, QUALIFYING, or both; RRWPO draws have
// participationOrder 1 (RR) and 2 (playoff). Testing all combinations ensures
// a level is included if ANY participation context would match.
const PROBE_CONTEXTS = [
  { rankingStage: MAIN, participationOrder: 1, flightNumber: 1 },
  { rankingStage: MAIN, participationOrder: 2, flightNumber: 1 },
  { rankingStage: QUALIFYING, participationOrder: 1, flightNumber: 1 },
  { rankingStage: QUALIFYING, participationOrder: 2, flightNumber: 1 },
];

export function getApplicableAwardProfileLevels({
  policyDefinitions,
  tournamentRecord,
  eventId,
  drawId,
}: GetApplicableAwardProfileLevelsArgs) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const { policyDefinitions: attachedPolicies } = getPolicyDefinitions({
    policyTypes: [POLICY_TYPE_RANKING_POINTS],
    tournamentRecord,
  });

  const pointsPolicy =
    policyDefinitions?.[POLICY_TYPE_RANKING_POINTS] ?? attachedPolicies?.[POLICY_TYPE_RANKING_POINTS];
  if (!pointsPolicy) return { error: MISSING_POLICY_DEFINITION };

  const awardProfiles = pointsPolicy.awardProfiles;
  if (!awardProfiles?.length) return { levels: [], ...SUCCESS };

  const allLevels = collectCandidateLevels(awardProfiles);

  // Without draw/event context, return all levels from the policy
  if (!eventId && !drawId) {
    return { levels: allLevels, ...SUCCESS };
  }

  const scope = resolveScope({ tournamentRecord, eventId, drawId });
  const levels = filterLevelsByScope(allLevels, awardProfiles, scope);

  return { levels, ...SUCCESS };
}

function collectCandidateLevels(awardProfiles): number[] {
  const levels = new Set<number>();

  for (const profile of awardProfiles) {
    if (profile.levels?.length) {
      for (const lvl of profile.levels) levels.add(lvl);
    }
  }

  // For profiles with maxLevel but no explicit levels array,
  // ensure we test levels 1..maxLevel
  const maxLevelValues = awardProfiles.filter((p) => p.maxLevel !== undefined).map((p) => p.maxLevel);
  if (maxLevelValues.length) {
    const upperBound = Math.max(...maxLevelValues);
    for (let i = 1; i <= upperBound; i++) levels.add(i);
  }

  return [...levels].sort((a, b) => a - b);
}

function resolveScope({ tournamentRecord, eventId, drawId }) {
  const found = findEvent({ tournamentRecord, eventId, drawId });
  const event = found.event;
  const drawDefinition = found.drawDefinition;

  return {
    eventType: event?.eventType,
    category: event?.category,
    gender: event?.gender,
    drawType: drawDefinition?.drawType,
  };
}

function filterLevelsByScope(candidateLevels: number[], awardProfiles, scope): number[] {
  const { eventType, drawType, category, gender } = scope;

  return candidateLevels.filter((level) =>
    PROBE_CONTEXTS.some(
      (participation) =>
        getAwardProfile({
          awardProfiles,
          participation,
          eventType,
          drawType,
          category,
          gender,
          level,
        }).awardProfile,
    ),
  );
}
