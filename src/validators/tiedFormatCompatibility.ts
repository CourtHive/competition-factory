import { stringifyCombinedPointFormat } from '@Helpers/matchUpFormatCode/combinedPointFormat';
import { structuresOf, matchUpsOf } from '@Acquire/structureMembers';
import { parse } from '@Helpers/matchUpFormatCode/parse';

// constants and types
import type { DrawDefinition, Structure } from '@Types/tournamentTypes';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { ResultType } from '@Types/factoryTypes';
import {
  ROUND_OUTCOME,
  WIN_RATIO,
  WINNER,
  AD_HOC,
  SWISS,
  LADDER,
  ROUND_ROBIN,
  DOUBLE_ROUND_ROBIN,
} from '@Constants/drawDefinitionConstants';

export function formatCanEndTied(matchUpFormat?: string): boolean {
  const format = parse(matchUpFormat ?? '')?.setFormat;
  return !!format?.combinedPointTotal && format.combinedPointTotal % 2 === 0 && format.tieResolution === 'ALLOW';
}

export function advancesMatchWinner(drawDefinition: DrawDefinition, structure: Structure): boolean {
  if (structure.finishingPosition === ROUND_OUTCOME) return true;
  if (
    structure.finishingPosition !== WIN_RATIO &&
    (matchUpsOf(structure) ?? []).some((matchUp) => !!matchUp.roundPosition)
  )
    return true;
  return (drawDefinition.links ?? []).some(
    (link) =>
      link.linkType === WINNER &&
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
  if (formatCanEndTied(matchUpFormat) && structures.some((structure) => advancesMatchWinner(drawDefinition, structure)))
    return { error: INVALID_VALUES, info: 'tie-capable formats are not allowed in elimination structures' };
  const selectedIds = new Set(structures.map((structure) => structure.structureId));
  const rounds = (drawDefinition.competitionRounds ?? []).filter(
    (round) => selectedIds.has(round.structureId) && (!matchUpId || round.matchUpIds.includes(matchUpId)),
  );
  if (
    rounds.some((round) => force || matchUpFormat !== `SET1-S:${stringifyCombinedPointFormat(round.scoringContract)}`)
  )
    return { error: INVALID_VALUES, info: 'format is fixed by the applied rotating round scoring contract' };
  return {};
}

export function generationNeedsWinner(drawType?: string, hasPlayoffs = false): boolean {
  return hasPlayoffs || ![AD_HOC, SWISS, LADDER, ROUND_ROBIN, DOUBLE_ROUND_ROBIN].includes(drawType ?? '');
}
