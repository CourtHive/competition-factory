import { rotatingPartnerContractFormat } from '@Helpers/rotatingPartners/scoringContract';
import { structuresOf, matchUpsOf } from '@Helpers/drawTopology/structureMembers';
import { isRoundWinnerLink } from '@Helpers/drawTopology/linkTraversal';

// constants and types
import type { DrawDefinition, Structure, Event } from '@Types/tournamentTypes';
import { ROUND_OUTCOME, WIN_RATIO } from '@Constants/drawDefinitionConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { ResultType } from '@Types/factoryTypes';

export function advancesMatchWinner(drawDefinition: DrawDefinition, structure: Structure): boolean {
  if (structure.finishingPosition === ROUND_OUTCOME) return true;
  if (
    structure.finishingPosition !== WIN_RATIO &&
    (matchUpsOf(structure) ?? []).some((matchUp) => !!matchUp.roundPosition)
  )
    return true;
  return (drawDefinition.links ?? []).some(
    (link) =>
      isRoundWinnerLink(link, drawDefinition) &&
      link.source?.structureId === structure.structureId &&
      typeof link.source.roundNumber === 'number',
  );
}

export function drawStructures(drawDefinition: DrawDefinition): Structure[] {
  const flatten = (structures: Structure[]): Structure[] =>
    structures.flatMap((structure) => [structure, ...flatten(structuresOf(structure) ?? [])]);
  return flatten(drawDefinition.structures ?? []);
}

/** Preflight before any write, including bulk format changes. */
export function checkDrawFormatCompatibility(params: {
  drawDefinition: DrawDefinition;
  matchUpFormat: string;
  structureIds?: string[];
  matchUpId?: string;
  force?: boolean;
  event?: Event;
}): ResultType {
  const { drawDefinition, matchUpFormat, structureIds, matchUpId, force } = params;
  const roots = drawStructures(drawDefinition).filter(
    (structure) => !structureIds?.length || structureIds.includes(structure.structureId),
  );
  const scoped = [
    ...new Set(roots.flatMap((structure) => drawStructures({ ...drawDefinition, structures: [structure] }))),
  ];
  const structures = scoped.filter(
    (structure) => !matchUpId || (matchUpsOf(structure) ?? []).some((matchUp) => matchUp.matchUpId === matchUpId),
  );
  const selectedIds = new Set(structures.map((structure) => structure.structureId));
  const rounds = (drawDefinition.competitionRounds ?? []).filter(
    (round) => selectedIds.has(round.structureId) && (!matchUpId || round.matchUpIds.includes(matchUpId)),
  );
  // force strips matchUp-level formats in the writer, even when the requested format is unchanged.
  // Applied rounds keep their historical contract; force cannot erase that persisted format.
  if (rounds.some((round) => force || matchUpFormat !== rotatingPartnerContractFormat(round.scoringContract)))
    return { error: INVALID_VALUES, info: 'format is fixed by the applied rotating round scoring contract' };
  return {};
}
