import { computeScoreGroups } from '@Generators/drawDefinitions/drawTypes/adHoc/swiss/computeScoreGroups';
import { computeTiebreakers } from '@Generators/drawDefinitions/drawTypes/adHoc/swiss/computeTiebreakers';
import { swissPolicyOf } from '@Generators/drawDefinitions/drawTypes/adHoc/swiss/swissPolicyOf';
import { getParticipantId } from '@Functions/global/extractors';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import { findStructure } from '@Acquire/findStructure';
import { matchUpsOf } from '@Acquire/structureMembers';

// constants and types
import { MISSING_DRAW_DEFINITION, STRUCTURE_NOT_FOUND, ErrorType } from '@Constants/errorConditionConstants';
import { STRUCTURE_SELECTED_STATUSES } from '@Constants/entryStatusConstants';
import type { SwissStanding, ScoreGroup } from '@Types/swissTypes';
import type { DrawDefinition } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';

type GetSwissStandingsArgs = {
  tiebreakMethods?: string[];
  drawDefinition: DrawDefinition;
  structureId?: string;
};

type GetSwissStandingsResult = {
  standings?: SwissStanding[];
  scoreGroups?: ScoreGroup[];
  roundsPlayed?: number;
  error?: ErrorType;
  info?: string;
  success?: boolean;
};

export function getSwissStandings({
  tiebreakMethods = ['BUCHHOLZ', 'SONNEBORN_BERGER'],
  drawDefinition,
  structureId,
}: GetSwissStandingsArgs): GetSwissStandingsResult {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const structure = structureId
    ? findStructure({ drawDefinition, structureId }).structure
    : drawDefinition.structures?.find((s) => isAdHoc({ structure: s }));

  if (!structure) return { error: STRUCTURE_NOT_FOUND };

  const matchUps = matchUpsOf(structure) ?? [];
  const participantIds = (drawDefinition.entries ?? [])
    .filter((e) => !!e.entryStatus && STRUCTURE_SELECTED_STATUSES.includes(e.entryStatus))
    .map(getParticipantId)
    .filter(Boolean) as string[];

  if (!participantIds.length) {
    return { standings: [], scoreGroups: [], roundsPlayed: 0, ...SUCCESS };
  }

  // the draw's policy decides what a bye and a draw score, and the rounds a dummy's score is capped by (C.07 16.4.2)
  const { swissPolicy, error, info } = swissPolicyOf({ drawDefinition });
  if (error) return { error, info };
  const { allowDraws, byePoints, totalRounds } = swissPolicy ?? {};

  const { scoreGroups, records } = computeScoreGroups({ participantIds, matchUps, allowDraws, byePoints });
  const standings = computeTiebreakers({ records, tiebreakMethods, totalRounds });

  const completedMatchUps = matchUps.filter((m) => m.winningSide);
  const roundNumbers = [...new Set(completedMatchUps.map((m) => m.roundNumber).filter(Boolean))];
  const roundsPlayed = roundNumbers.length;

  return { standings, scoreGroups, roundsPlayed, ...SUCCESS };
}
