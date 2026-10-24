import { structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { getWinnerLinkRoundNumbers } from '@Query/drawDefinition/linkGetter';
import { annotateScoreSets, buildMatchUpSides } from './addMatchUpContext';
import { matchUpsOf, structuresOf } from '@Acquire/structureMembers';
import { definedAttributes } from '@Tools/definedAttributes';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { getRoundMatchUps } from './getRoundMatchUps';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import type { DrawDefinition, Event, MatchUp, PositionAssignment, Structure, Tournament } from '@Types/tournamentTypes';
import type { RoundProfile } from '@Types/factoryTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
import { TEAM } from '@Constants/matchUpTypes';

/**
 * THE STRUCTURAL INDEX (outcome executor plan § 3.1.1, CA 2026-10-24: v2 decides on stored data and a structural
 * index, never on a hydration).
 *
 * One entry per matchUp of the draw, in the hydrated shape, carrying only what the outcome logic reads: the stored
 * matchUp, the context a structure gives it (`structureId`, `containerStructureId`, the round profile's `feedRound` and
 * `hasFedDrawPosition`, the inherited `matchUpType` and `matchUpFormat`), and its sides from the drawPosition →
 * positionAssignments join. Measured on a probe of every read v2 makes (Mentat report 2026-10-24
 * `outcome-v2-s2-structural-index-fields`): no participant record, name, schedule detail, round name or policy is read.
 *
 * NOT A SECOND DERIVATION. The sides are built by `buildMatchUpSides` and the round profile by `getRoundMatchUps`, the
 * functions hydration calls, so the two cannot drift; only the orchestration is the index's own. A side's `participant`
 * is read only as a presence test (`isActiveDownstream`), so a side carries the stub `{ participantId }` when hydration
 * would carry the participant: when the tournament holds it. A draw outcome recorded with no tournament (mocksEngine
 * completing a draw it is still generating) hydrates no participant at all, and the index answers the same. Of the
 * tournament, only its participants' ids are read.
 *
 * TEAM is not indexed yet: a line's sides come from its dual's line-ups (`getCollectionAssignment`). A draw holding a
 * TEAM matchUp answers `unsupported`, and its caller hydrates as before (v2's TEAM routes abstain until S7).
 *
 * Read-only: an entry shares nested objects (`score`, `sideExitProvenance`) with the stored matchUp.
 */
export type StructuralIndex = {
  matchUps: HydratedMatchUp[];
  unsupported?: typeof TEAM;
};

type BuildStructuralIndexArgs = {
  /** the top-level structures to index, the rest left out: what a working view indexes again after a write (§ 3.2) */
  structureIds?: Set<string>;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  event?: Event;
};

// the context first and the stored matchUp over it, empty values dropped, as hydration does (`addMatchUpContext`)
const onlyDefined = (obj: object) => definedAttributes(obj, undefined, true, true);

export function buildStructuralIndex({
  tournamentRecord,
  drawDefinition,
  structureIds,
  event,
}: BuildStructuralIndexArgs): StructuralIndex {
  const matchUps: HydratedMatchUp[] = [];
  const participantIds = new Set((tournamentRecord?.participants ?? []).map(({ participantId }) => participantId));
  for (const structure of drawDefinition.structures ?? []) {
    if (structureIds && !structureIds.has(structure.structureId)) continue;
    const indexed = indexStructure({ drawDefinition, participantIds, structure, event });
    if (indexed.unsupported) return { matchUps: [], unsupported: indexed.unsupported };
    matchUps.push(...indexed.matchUps);
  }
  return { matchUps };
}

// whether `annotateScoreSets` changes a score under this format: a tiebreak-only or timed set (its own early return)
const annotatingFormats = new Map<string, boolean>();
function annotates(matchUpFormat: string): boolean {
  if (!annotatingFormats.has(matchUpFormat)) {
    const { finalSetFormat, setFormat } = parse(matchUpFormat) ?? {};
    annotatingFormats.set(matchUpFormat, !!(finalSetFormat?.tiebreakSet || setFormat?.tiebreakSet || setFormat?.timed));
  }
  return !!annotatingFormats.get(matchUpFormat);
}

type Member = { matchUp: MatchUp; structureId: string; containerStructureId?: string };

function indexStructure({
  drawDefinition,
  participantIds,
  structure,
  event,
}: {
  drawDefinition: DrawDefinition;
  participantIds: Set<string>;
  structure: Structure;
  event?: Event;
}): StructuralIndex {
  const items = structuresOf(structure);
  const members: Member[] = items
    ? items.flatMap((item) =>
        (matchUpsOf(item) ?? []).map((matchUp) => ({
          containerStructureId: structure.structureId,
          structureId: item.structureId,
          matchUp,
        })),
      )
    : (matchUpsOf(structure) ?? []).map((matchUp) => ({ matchUp, structureId: structure.structureId }));
  if (members.some(({ matchUp }) => !!matchUp.tieMatchUps || isMatchUpEventType(TEAM)(matchUp.matchUpType)))
    return { matchUps: [], unsupported: TEAM };

  const { positionAssignments } = structureAssignedDrawPositions({ structure });
  // the first assignment of each drawPosition, as `getSide`'s scan finds it
  const assignmentsByPosition = new Map<number, PositionAssignment>();
  for (const assignment of positionAssignments)
    if (assignment.drawPosition && !assignmentsByPosition.has(assignment.drawPosition))
      assignmentsByPosition.set(assignment.drawPosition, assignment);
  const winnerLinkRoundNumbers = getWinnerLinkRoundNumbers({ structureId: structure.structureId, drawDefinition });
  const { roundProfile } = getRoundMatchUps({
    matchUps: members.map(({ matchUp }) => matchUp) as HydratedMatchUp[],
    winnerLinkRoundNumbers,
  });

  return {
    matchUps: members.map((member) =>
      indexMatchUp({
        ...member,
        positionAssignments,
        assignmentsByPosition,
        participantIds,
        roundProfile,
        drawDefinition,
        structure,
        event,
      }),
    ),
  };
}

function indexMatchUp({
  containerStructureId,
  positionAssignments,
  assignmentsByPosition,
  participantIds,
  drawDefinition,
  roundProfile,
  structureId,
  structure,
  matchUp,
  event,
}: Member & {
  assignmentsByPosition: Map<number, PositionAssignment>;
  positionAssignments: PositionAssignment[];
  participantIds: Set<string>;
  drawDefinition: DrawDefinition;
  roundProfile?: RoundProfile;
  structure: Structure;
  event?: Event;
}): HydratedMatchUp {
  const roundNumber = matchUp.roundNumber as number;
  const round = roundNumber ? roundProfile?.[roundNumber] : undefined;
  const drawPositions = matchUp.drawPositions ?? [];
  const matchUpType =
    matchUp.matchUpType ||
    structure.matchUpType ||
    drawDefinition.matchUpType ||
    (!isMatchUpEventType(TEAM)(event?.eventType) && event?.eventType) ||
    undefined;
  const matchUpFormat =
    matchUp.matchUpFormat ?? structure.matchUpFormat ?? drawDefinition.matchUpFormat ?? event?.matchUpFormat;

  const sides = buildMatchUpSides({
    sourceDrawPositionRoundRanges: undefined,
    collectionAssignmentDetail: undefined,
    seedAssignments: undefined,
    assignmentsByPosition,
    roundPosition: matchUp.roundPosition,
    positionAssignments,
    drawPositions,
    onlyDefined,
    roundProfile,
    roundNumber,
    matchUp,
  }).map((side) =>
    participantIds.has(side.participantId) ? { ...side, participant: { participantId: side.participantId } } : side,
  );

  const entry = {
    ...onlyDefined({
      hasFedDrawPosition: round?.hasFedDrawPosition,
      feedRound: round?.feedRound,
      drawId: drawDefinition.drawId,
      containerStructureId,
      matchUpFormat,
      drawPositions,
      matchUpType,
      structureId,
    }),
    ...onlyDefined(matchUp),
    // nested values are filtered with the defaults, as hydration's deep filter does: an empty `sets` stays
    ...(matchUp.score ? { score: definedAttributes(matchUp.score, undefined, undefined, true) } : {}),
    sides,
  } as HydratedMatchUp;
  // a tiebreak-only or timed set reads as hydration presents it (`annotateScoreSets`), on the entry's own copy
  if (matchUpFormat && entry.score?.scoreStringSide1 && annotates(matchUpFormat)) {
    entry.score = makeDeepCopy(entry.score, false, true);
    annotateScoreSets(entry, matchUpFormat);
  }
  return entry;
}
