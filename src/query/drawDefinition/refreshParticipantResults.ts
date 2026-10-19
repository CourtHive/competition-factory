import { tallyParticipantResults } from '@Query/matchUps/roundRobinTally/tallyParticipantResults';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { getPolicyDefinitions } from '@Query/extensions/getAppliedPolicies';
import { createSubOrderMap } from '@Query/structure/createSubOrderMap';
import { structuresOf } from '@Acquire/structureMembers';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import { isLucky } from '@Query/drawDefinition/isLucky';

// constants and types
import type { DrawDefinition, Event, MatchUp, Structure, Tournament } from '@Types/tournamentTypes';
import { POLICY_TYPE_ROUND_ROBIN_TALLY } from '@Constants/policyConstants';
import type { PolicyDefinitions } from '@Types/factoryTypes';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import type { HydratedMatchUp } from '@Types/hydrated';

/**
 * The structures a tally describes are the ones the score path keeps a tally for: round robin groups, ad hoc and
 * lucky structures. An elimination structure is placed by its bracket; a tally of it ranks every participant by
 * matchUps won and then tries to break ties among hundreds of first-round losers, and nothing reads the result.
 */
export function isTalliedStructure({ drawDefinition, structure }: { drawDefinition?: DrawDefinition; structure }) {
  return !!structuresOf(structure) || isAdHoc({ structure }) || isLucky({ drawDefinition, structure });
}

type RefreshParticipantResultsArgs = {
  policyDefinitions?: PolicyDefinitions;
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  matchUps: MatchUp[]; // hydrated: each carries the structureId of its round robin group
  pressureRating?: boolean;
  structure: Structure;
  event?: Event;
};

/**
 * Tallies a structure from its matchUps rather than reading the stored tally. A round robin is tallied group by
 * group, as the score path stores it: a container's matchUps span its groups, and one tally across them would rank
 * participants who never met. The tally policy is the caller's when it supplies one, else the one in force for the
 * draw, as the score path resolves it, so a refresh agrees with what is stored.
 */
export function refreshParticipantResults({
  policyDefinitions,
  tournamentRecord,
  drawDefinition,
  pressureRating,
  structure,
  matchUps,
  event,
}: RefreshParticipantResultsArgs) {
  const tallyPolicies = policyDefinitions?.[POLICY_TYPE_ROUND_ROBIN_TALLY]
    ? policyDefinitions
    : getPolicyDefinitions({ policyTypes: [POLICY_TYPE_ROUND_ROBIN_TALLY], tournamentRecord, drawDefinition, event })
        .policyDefinitions;

  const groups = structuresOf(structure) ?? [structure];
  const participantResults = {};
  const report: unknown[] = [];

  for (const group of groups) {
    const groupMatchUps =
      group === structure ? matchUps : matchUps.filter((m) => (m as HydratedMatchUp).structureId === group.structureId);
    const hasTeamMatchUps = groupMatchUps.some((matchUp) => matchUp.matchUpType === TEAM_MATCHUP);
    const consideredMatchUps = hasTeamMatchUps
      ? groupMatchUps.filter((matchUp) => matchUp.matchUpType === TEAM_MATCHUP)
      : groupMatchUps;
    if (!consideredMatchUps.length) continue;

    const { positionAssignments } = getPositionAssignments({ structure: group });
    const { subOrderMap } = createSubOrderMap({ positionAssignments });
    const result = tallyParticipantResults({
      matchUpFormat: group.matchUpFormat ?? structure.matchUpFormat,
      policyDefinitions: tallyPolicies,
      matchUps: consideredMatchUps,
      pressureRating,
      subOrderMap,
    });
    Object.assign(participantResults, result?.participantResults);
    if (result?.report) report.push(...result.report);
  }

  return { participantResults, report: report.length ? report : undefined };
}
