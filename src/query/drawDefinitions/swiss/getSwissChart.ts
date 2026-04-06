import { computeScoreGroups } from '@Generators/drawDefinitions/drawTypes/adHoc/swiss/computeScoreGroups';
import { getParticipantId } from '@Functions/global/extractors';
import { findStructure } from '@Acquire/findStructure';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';

import { MISSING_DRAW_DEFINITION, STRUCTURE_NOT_FOUND, ErrorType } from '@Constants/errorConditionConstants';
import { STRUCTURE_SELECTED_STATUSES } from '@Constants/entryStatusConstants';
import type { DrawDefinition } from '@Types/tournamentTypes';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { SUCCESS } from '@Constants/resultConstants';

type SwissChartNode = {
  wins: number;
  losses: number;
  draws: number;
  participantIds: string[];
};

type SwissChartRound = {
  roundNumber: number;
  nodes: SwissChartNode[];
};

type GetSwissChartArgs = {
  drawDefinition: DrawDefinition;
  structureId?: string;
};

type GetSwissChartResult = {
  rounds?: SwissChartRound[];
  totalRounds?: number;
  error?: ErrorType;
  success?: boolean;
};

export function getSwissChart({ drawDefinition, structureId }: GetSwissChartArgs): GetSwissChartResult {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const structure = structureId
    ? findStructure({ drawDefinition, structureId }).structure
    : drawDefinition.structures?.find((s) => isAdHoc({ structure: s }));

  if (!structure) return { error: STRUCTURE_NOT_FOUND };

  const allMatchUps = structure.matchUps ?? [];
  const participantIds = (drawDefinition.entries ?? [])
    .filter((e) => STRUCTURE_SELECTED_STATUSES.includes(e.entryStatus ?? ''))
    .map(getParticipantId)
    .filter(Boolean) as string[];

  if (!participantIds.length) {
    return { rounds: [], totalRounds: 0, ...SUCCESS };
  }

  const roundNumbers = [...new Set(allMatchUps.map((m) => m.roundNumber).filter(Boolean))].sort(
    (a, b) => (a ?? 0) - (b ?? 0),
  );

  // build chart: for each round, compute score groups from matchUps up to that round
  const rounds: SwissChartRound[] = [];

  // round 0: everyone starts at 0-0-0
  rounds.push({
    roundNumber: 0,
    nodes: [{ wins: 0, losses: 0, draws: 0, participantIds: [...participantIds] }],
  });

  for (const roundNum of roundNumbers) {
    const matchUpsThrough = allMatchUps.filter(
      (m) => m.matchUpStatus === COMPLETED && (m.roundNumber ?? 0) <= (roundNum ?? 0),
    );

    const { scoreGroups } = computeScoreGroups({
      matchUps: matchUpsThrough,
      participantIds,
    });

    rounds.push({
      roundNumber: roundNum ?? 0,
      nodes: scoreGroups.map((g) => ({
        wins: g.wins,
        losses: g.losses,
        draws: g.draws,
        participantIds: [...g.participantIds],
      })),
    });
  }

  return { rounds, totalRounds: roundNumbers.length, ...SUCCESS };
}
