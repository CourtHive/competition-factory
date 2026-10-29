import { structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { resolveTieFormat } from '@Query/hierarchical/tieFormats/resolveTieFormat';
import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { getWinnerLinkRoundNumbers } from '@Query/drawDefinition/linkGetter';
import { annotateScoreSets, buildMatchUpSides } from './addMatchUpContext';
import { matchUpsOf, structuresOf } from '@Acquire/structureMembers';
import { getCollectionAssignment } from './getCollectionAssignment';
import { definedAttributes } from '@Tools/definedAttributes';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { getRoundMatchUps } from './getRoundMatchUps';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { BYE } from '@Constants/matchUpStatusConstants';
import type { RoundProfile } from '@Types/factoryTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
import { TEAM } from '@Constants/matchUpTypes';
import type {
  DrawDefinition,
  Event,
  MatchUp,
  Participant,
  PositionAssignment,
  Structure,
  Tournament,
} from '@Types/tournamentTypes';

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
 * TEAM, on request (`team`, the outcome view; S7): a dual is indexed as any matchUp, with its lines nested
 * (`tieMatchUps`) and listed beside it, each line as hydration builds it through its dual (`processTieMatchUps`): the
 * dual's drawPositions, round and finishing positions, the collection's matchUpType and format, a BYE where the dual
 * is one, and sides from the dual's line-ups (`getCollectionAssignment`). Without `team`, a draw holding a TEAM matchUp
 * answers `unsupported` and its caller hydrates as before.
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
  /** index TEAM duals and their lines; without it a draw holding one answers `unsupported` */
  team?: boolean;
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
  team,
}: BuildStructuralIndexArgs): StructuralIndex {
  const matchUps: HydratedMatchUp[] = [];
  const participants = tournamentRecord?.participants;
  const participantIds = new Set((participants ?? []).map(({ participantId }) => participantId));
  for (const structure of drawDefinition.structures ?? []) {
    if (structureIds && !structureIds.has(structure.structureId)) continue;
    const indexed = indexStructure({ drawDefinition, participantIds, participants, structure, event, team });
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
  participants,
  structure,
  event,
  team,
}: {
  drawDefinition: DrawDefinition;
  participantIds: Set<string>;
  participants?: Participant[];
  structure: Structure;
  event?: Event;
  team?: boolean;
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
  const isTeam = ({ matchUp }: Member) => !!matchUp.tieMatchUps || isMatchUpEventType(TEAM)(matchUp.matchUpType);
  if (!team && members.some(isTeam)) return { matchUps: [], unsupported: TEAM };

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

  const shared = {
    positionAssignments,
    assignmentsByPosition,
    participantIds,
    roundProfile,
    drawDefinition,
    structure,
  };
  return {
    matchUps: members.flatMap((member) => {
      const entry = indexMatchUp({ ...member, ...shared, event });
      if (!member.matchUp.tieMatchUps) return [entry];
      const lines = indexLines({ dual: member, dualEntry: entry, participants, shared, event });
      entry.tieMatchUps = lines;
      return [entry, ...lines];
    }),
  };
}

type Shared = Omit<Parameters<typeof indexMatchUp>[0], keyof Member | 'event' | 'line'>;

/** a dual's lines, each built through its dual as hydration builds it (`processTieMatchUps`) */
function indexLines({
  participants,
  dualEntry,
  shared,
  event,
  dual,
}: {
  participants?: Participant[];
  dualEntry: HydratedMatchUp;
  shared: Shared;
  event?: Event;
  dual: Member;
}): HydratedMatchUp[] {
  const { drawDefinition, structure, positionAssignments } = shared;
  const dualTieFormat = resolveTieFormat({ drawDefinition, structure, matchUp: dual.matchUp, event })?.tieFormat;
  const drawPositions = dual.matchUp.drawPositions ?? [];
  // the line-ups by side, as the dual's sides carry them; the team is found from the positions where none is given
  const sideLineUps = dualEntry.sides?.map(({ drawPosition, sideNumber, lineUp }: any) => ({
    drawPosition,
    sideNumber,
    lineUp,
  }));
  return (dual.matchUp.tieMatchUps ?? []).map((matchUp) => {
    // a line's own tieFormat, else its dual's (which already fell back to the structure, draw and event)
    const tieFormat =
      matchUp.tieFormat || matchUp.tieFormatId
        ? resolveTieFormat({ drawDefinition, structure, matchUp, event })?.tieFormat
        : dualTieFormat;
    const collection = tieFormat?.collectionDefinitions?.find(
      (definition) => definition.collectionId === matchUp.collectionId,
    );
    const matchUpType =
      matchUp.matchUpType ||
      collection?.matchUpType ||
      structure.matchUpType ||
      drawDefinition.matchUpType ||
      (!isMatchUpEventType(TEAM)(event?.eventType) && event?.eventType) ||
      undefined;
    const collectionAssignmentDetail = getCollectionAssignment({
      collectionPosition: matchUp.collectionPosition,
      collectionId: matchUp.collectionId as string,
      tournamentParticipants: participants,
      positionAssignments,
      drawDefinition,
      drawPositions,
      sideLineUps,
      matchUpType,
    });
    return indexMatchUp({
      ...shared,
      // in a round robin the line is the container's, with no container of its own, as hydration places it
      structureId: dual.containerStructureId ?? dual.structureId,
      matchUp,
      event,
      line: {
        matchUpFormat:
          collection?.matchUpFormat ?? structure.matchUpFormat ?? drawDefinition.matchUpFormat ?? event?.matchUpFormat,
        finishingPositionRange: dualEntry.finishingPositionRange,
        collectionBye: dual.matchUp.matchUpStatus === BYE,
        roundNumber: dual.matchUp.roundNumber,
        matchUpTieId: dual.matchUp.matchUpId,
        collectionAssignmentDetail,
        drawPositions,
        matchUpType,
      },
    });
  });
}

/** what a line takes from its dual and its collection, over its own stored values where hydration puts it so */
type LineContext = {
  collectionAssignmentDetail: ReturnType<typeof getCollectionAssignment>;
  finishingPositionRange?: HydratedMatchUp['finishingPositionRange'];
  matchUpType?: string;
  matchUpFormat?: string;
  collectionBye: boolean;
  drawPositions: number[];
  matchUpTieId: string;
  roundNumber?: number;
};

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
  line,
}: Member & {
  line?: LineContext;
  assignmentsByPosition: Map<number, PositionAssignment>;
  positionAssignments: PositionAssignment[];
  participantIds: Set<string>;
  drawDefinition: DrawDefinition;
  roundProfile?: RoundProfile;
  structure: Structure;
  event?: Event;
}): HydratedMatchUp {
  const roundNumber = (matchUp.roundNumber ?? line?.roundNumber) as number;
  const round = roundNumber ? roundProfile?.[roundNumber] : undefined;
  const drawPositions = line?.drawPositions ?? matchUp.drawPositions ?? [];
  const matchUpType = line
    ? line.matchUpType
    : matchUp.matchUpType ||
      structure.matchUpType ||
      drawDefinition.matchUpType ||
      (!isMatchUpEventType(TEAM)(event?.eventType) && event?.eventType) ||
      undefined;
  // a line's format comes from its collection; a dual has none, its tieFormat standing in its place
  const matchUpFormat = line
    ? line.matchUpFormat
    : (matchUp.matchUpFormat ?? structure.matchUpFormat ?? drawDefinition.matchUpFormat ?? event?.matchUpFormat);

  const sides = buildMatchUpSides({
    sourceDrawPositionRoundRanges: undefined,
    collectionAssignmentDetail: line?.collectionAssignmentDetail,
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
      finishingPositionRange: matchUp.finishingPositionRange ?? line?.finishingPositionRange,
      matchUpFormat: matchUpType === TEAM ? undefined : matchUpFormat,
      hasFedDrawPosition: round?.hasFedDrawPosition,
      matchUpTieId: line?.matchUpTieId,
      feedRound: round?.feedRound,
      drawId: drawDefinition.drawId,
      containerStructureId,
      drawPositions,
      matchUpType,
      structureId,
      roundNumber,
    }),
    ...onlyDefined(matchUp),
    // a line of a BYE dual is a BYE, over the TO_BE_PLAYED it is stored as (hydration OPEN-1)
    ...(line?.collectionBye ? { matchUpStatus: BYE } : {}),
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
