import { stringifyCombinedPointFormat } from '@Helpers/matchUpFormatCode/combinedPointFormat';
import { parse, type ParsedFormat } from '@Helpers/matchUpFormatCode/parse';
import { isRoundWinnerLink } from '@Query/drawDefinition/linkTraversal';
import { structuresOf, matchUpsOf } from '@Acquire/structureMembers';

// constants and types
import { ROUND_OUTCOME, WIN_RATIO } from '@Constants/drawDefinitionConstants';
import type { DrawDefinition, Structure, Event } from '@Types/tournamentTypes';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { ResultType } from '@Types/factoryTypes';

/** A timed segment with no tiebreak at time closes level when time is called level (spec § 6.4 rule 3). */
function segmentCanCloseLevel(setFormat?: { timed?: boolean; tiebreakFormat?: unknown }): boolean {
  return !!setFormat?.timed && !setFormat.tiebreakFormat;
}

/**
 * Whether a match played in `matchUpFormat` can end level, `COMPLETED` with no `winningSide` (scoring-engine spec
 * § 9.7). A structure that advances a winner accepts such a format: its level result names the winner and records how
 * it was decided (standings phase 2 § 1.1, CA 2026-11-04), and one with no decider is refused at entry.
 *
 * - a `P{n}` combined total with an even n and no tie resolution (§ 7);
 * - an aggregate whose total can tie with no declared decider: only an exactly-N aggregate declares
 *   one, its `-F:` (set N + 1, § 9.4), and a timed decider with no tiebreak at time decides nothing;
 * - an exactly-N or best-of-N count that can be level once every set is played: an even N, or any
 *   set that can close level (a timed segment with no `/TB`, in the ordinary or the final format).
 *   With an odd N, one level set and an even split of the rest is a level count (§ 9.1, § 9.2).
 */
export function formatCanEndTied(matchUpFormat?: string): boolean {
  return parsedFormatCanEndTied(parse(matchUpFormat ?? ''));
}

/** `formatCanEndTied` on a parsed format. */
export function parsedFormatCanEndTied(parsed?: ParsedFormat): boolean {
  const format = parsed?.setFormat;
  if (!parsed || !format) return false;
  if (format.combinedPointTotal) return format.combinedPointTotal % 2 === 0 && format.tieResolution === 'ALLOW';

  // unlimited overtime plays periods until one ends unequal: it cannot finish level (a match clock, which could
  // end it level, is refused with overtime until the clock-expiry slice, Ruling 1)
  if (parsed.overtimeFormat?.count === 'unlimited') return false;

  if (parsed.aggregate)
    return !(parsed.exactly && parsed.finalSetFormat) || segmentCanCloseLevel(parsed.finalSetFormat);

  const setCount = parsed.exactly ?? parsed.bestOf ?? 1;
  if (setCount % 2 === 0) return true;
  const finalFormat = parsed.finalSetFormat ?? format;
  return segmentCanCloseLevel(finalFormat) || (setCount > 1 && segmentCanCloseLevel(format));
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
  if (
    rounds.some((round) => force || matchUpFormat !== `SET1-S:${stringifyCombinedPointFormat(round.scoringContract)}`)
  )
    return { error: INVALID_VALUES, info: 'format is fixed by the applied rotating round scoring contract' };
  return {};
}
