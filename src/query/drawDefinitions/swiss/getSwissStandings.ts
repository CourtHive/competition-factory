import { computeScoreGroups } from '@Generators/drawDefinitions/drawTypes/adHoc/swiss/computeScoreGroups';
import { computeTiebreakers } from '@Generators/drawDefinitions/drawTypes/adHoc/swiss/computeTiebreakers';
import { getParticipantId } from '@Functions/global/extractors';
import { findStructure } from '@Acquire/findStructure';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';

import { MISSING_DRAW_DEFINITION, STRUCTURE_NOT_FOUND, ErrorType } from '@Constants/errorConditionConstants';
import type { DrawDefinition } from '@Types/tournamentTypes';
import type { SwissStanding, ScoreGroup } from '@Types/swissTypes';
import { STRUCTURE_SELECTED_STATUSES } from '@Constants/entryStatusConstants';
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

  const matchUps = structure.matchUps ?? [];
  const participantIds = (drawDefinition.entries ?? [])
    .filter((e) => STRUCTURE_SELECTED_STATUSES.includes(e.entryStatus ?? ''))
    .map(getParticipantId)
    .filter(Boolean) as string[];

  if (!participantIds.length) {
    return { standings: [], scoreGroups: [], roundsPlayed: 0, ...SUCCESS };
  }

  const { scoreGroups, records } = computeScoreGroups({ participantIds, matchUps });
  const standings = computeTiebreakers({ records, tiebreakMethods });

  const completedMatchUps = matchUps.filter((m) => m.winningSide);
  const roundNumbers = [...new Set(completedMatchUps.map((m) => m.roundNumber).filter(Boolean))];
  const roundsPlayed = roundNumbers.length;

  return { standings, scoreGroups, roundsPlayed, ...SUCCESS };
}
