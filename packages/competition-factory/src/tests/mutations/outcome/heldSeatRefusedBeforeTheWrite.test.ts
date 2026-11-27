import { setOutcomePipeline } from '@Global/state/globalState';
import { defined } from '@Tests/helpers/defined';
import { afterEach, describe, expect, it } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants and types
import { COMPLETED, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import {
  DRAW_POSITION_ASSIGNED,
  DRAW_POSITION_OCCUPIED,
  INVALID_DRAW_POSITION,
} from '@Constants/errorConditionConstants';
import {
  COMPASS,
  CONSOLATION,
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  MAIN,
  SINGLE_ELIMINATION,
} from '@Constants/drawDefinitionConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
  type OutcomePipelineMode,
} from '@Constants/outcomePipelineConstants';

const MODES: OutcomePipelineMode[] = [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL];

/**
 * A WINNER OR A LOSER WHOSE SEAT IS HELD BY SOMEBODY ELSE IS REFUSED BEFORE THE FIRST WRITE (record soak 2026-11-18,
 * class D4: an error leaves the record unchanged, and no mutation relies on rollback).
 *
 * `directParticipants` writes the result and then places the winner and the loser. On a record converted from elsewhere
 * a seat can be held where the factory would have left it free:
 *
 *  - THE WINNER'S: the stored winner is the side that did not advance, and the next matchUp is full
 *    (`ERR_EXISTING_POSITION_ASSIGNMENT`, 14 calls of arm (a));
 *  - THE LOSER'S: the consolation was seated in another order, and both seats of the loser link's matchUp are taken
 *    (`ERR_OCCUPIED_DRAW_POSITION`, arm (b) and the nest sample), also where the matchUp stores a double exit, which
 *    is unwound before the winner is placed;
 *  - A CARRIED EXIT'S, A LEVEL ON: under `propagateExitStatus` a walkover's loser is seated, the matchUp they land in is
 *    awarded to its other side, and they are sent across that matchUp's own loser link, where both seats are taken
 *    (`ERR_OCCUPIED_DRAW_POSITION`, 13 calls on COMPASS draws of arm (b): refused after the source was written and its
 *    loser seated);
 *  - A FIRST-MATCH FEED'S: the consolation holds no assignment for the fed position (`ERR_INVALID_DRAW_POSITION`,
 *    arm (b), a consolation stored with some of its positionAssignments missing).
 *
 * v1 returned each error over a matchUp it had already written (and, for the loser, over the winner it had already
 * placed). v2 planned no refusal: under `v2` the call fell to v1 and wrote the same, and `differential` raised
 * "v1 ERR_..., v2 ok". Both now ask `heldSeatRefusal` before anything is written (§ 2 row 31), and the calls are direct:
 * nothing puts anything back, so the record is unchanged only if nothing was written.
 */

afterEach(() => setOutcomePipeline(OUTCOME_PIPELINE_V1));

const structureOf = (drawDefinition, stage: string) => drawDefinition.structures.find((s) => s.stage === stage);
const inRound = (matchUps, roundNumber: number) =>
  matchUps.filter((matchUp) => matchUp.roundNumber === roundNumber).sort((a, b) => a.roundPosition - b.roundPosition);

/** the stored winner is the side that did not advance, and the next matchUp is full with no winner of its own */
function winnerSeatHeld() {
  const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 4, completeAllMatchUps: true }],
  });
  const matchUps = defined(
    defined(defined(tournamentRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0].structures,
    'structures',
  )[0].matchUps;
  const [source] = inRound(matchUps, 1);
  const [final] = inRound(matchUps, 2);
  source.winningSide = 3 - source.winningSide;
  delete source.score;
  delete final.winningSide;
  delete final.score;
  const outcome = { matchUpStatus: COMPLETED, winningSide: source.winningSide };
  return { tournamentRecord, drawId: drawIds[0], matchUpId: source.matchUpId, outcome, error: DRAW_POSITION_ASSIGNED };
}

/** a first-round matchUp nobody has played, whose loser's consolation seat holds the loser of another matchUp */
function loserSeatHeld(seatTaken = true) {
  const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: FIRST_ROUND_LOSER_CONSOLATION, drawSize: 8 }],
  });
  const [drawId] = drawIds;
  tournamentEngine.setState(tournamentRecord);
  const main = () =>
    tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps.filter(({ stage }) => stage === MAIN);
  const won = { matchUpStatus: COMPLETED, winningSide: 1 };
  const [source, ...played] = inRound(main(), 1);
  for (const { matchUpId } of played)
    expect(tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome: won }).success).toEqual(true);

  const record = tournamentEngine.getTournament().tournamentRecord;
  if (seatTaken) {
    const drawDefinition = record.events[0].drawDefinitions[0];
    const consolation = structureOf(drawDefinition, CONSOLATION);
    const target = consolation.matchUps.find((matchUp) => matchUp.matchUpId === source.loserMatchUpId);
    const seat = (drawPosition: number) => consolation.positionAssignments.find((a) => a.drawPosition === drawPosition);
    const free = target.drawPositions.map(seat).find((assignment) => !assignment.participantId);
    // the converter's shape: the loser of a matchUp of the other half sits where this matchUp's loser is owed a seat
    const other = consolation.positionAssignments.find(
      (assignment) => assignment.participantId && !target.drawPositions.includes(assignment.drawPosition),
    );
    expect(free && other).toBeDefined();
    free.participantId = other.participantId;
    delete other.participantId;
  }
  return { tournamentRecord: record, drawId, matchUpId: source.matchUpId, outcome: won, error: DRAW_POSITION_OCCUPIED };
}

type Shape = {
  tournamentRecord: any;
  drawId: string;
  matchUpId: string;
  outcome: object;
  params?: object;
  error: { code: string };
};
/** the same, with the matchUp stored as a double exit: its unwind runs before the winner and loser are placed */
function loserSeatHeldOverDoubleExit() {
  const shape = loserSeatHeld();
  const main = structureOf(shape.tournamentRecord.events[0].drawDefinitions[0], MAIN);
  main.matchUps.find((matchUp) => matchUp.matchUpId === shape.matchUpId).matchUpStatus = DOUBLE_WALKOVER;
  return shape;
}

/** a second-round matchUp whose loser has not played before, and a consolation with no assignment for the fed seat */
function fedSeatUnassigned() {
  const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize: 8, participantsCount: 4 }],
  });
  const drawDefinition = defined(defined(tournamentRecord.events, 'events')[0].drawDefinitions, 'drawDefinitions')[0];
  // every first-round matchUp holds a BYE: each participant's first match is in the second round
  const [source] = inRound(structureOf(drawDefinition, MAIN).matchUps, 2);
  const consolation = structureOf(drawDefinition, CONSOLATION);
  const target = consolation.matchUps.find((matchUp) => matchUp.matchUpId === source.loserMatchUpId);
  const fed = Math.min(...target.drawPositions.filter(Boolean));
  consolation.positionAssignments = consolation.positionAssignments.filter((a) => a.drawPosition !== fed);
  const outcome = { matchUpStatus: COMPLETED, winningSide: 1 };
  return { tournamentRecord, drawId: drawIds[0], matchUpId: source.matchUpId, outcome, error: INVALID_DRAW_POSITION };
}

/** a COMPASS: East's first matchUp unplayed, a West seat free for its loser, and both South seats beyond it taken */
function carriedExitSeatHeld(relabelled = false) {
  const { tournamentRecord, drawIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: COMPASS, drawSize: 8 }],
  });
  const [drawId] = drawIds;
  tournamentEngine.setState(tournamentRecord);
  const inStructure = (structureName: string) =>
    inRound(
      tournamentEngine
        .allDrawMatchUps({ drawId, inContext: true })
        .matchUps.filter((m) => m.structureName === structureName),
      1,
    );
  const won = { matchUpStatus: COMPLETED, winningSide: 1 };
  const play = (matchUpId: string) =>
    expect(tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome: won }).success).toEqual(true);
  // East's second, third and fourth matchUps, then West's second: one South seat holds its loser
  const [source, ...east] = inStructure('East');
  east.forEach(({ matchUpId }) => play(matchUpId));
  const [, westSecond] = inStructure('West');
  play(westSecond.matchUpId);

  // the converter's shape: South's seat for the loser of West's first matchUp holds somebody else (here the winner of
  // West's second, who has no claim on a seat anywhere else that a settle pass would give back)
  const record = tournamentEngine.getTournament().tournamentRecord;
  const structures = record.events[0].drawDefinitions[0].structures;
  const named = (structureName: string) => structures.find((structure) => structure.structureName === structureName);
  const [south] = inStructure('South');
  const westWinner = named('West').positionAssignments.find(
    (assignment) => assignment.drawPosition === westSecond.drawPositions[0],
  );
  const southSeat = named('South').positionAssignments.find(
    (assignment) => south.drawPositions.includes(assignment.drawPosition) && !assignment.participantId,
  );
  expect(westWinner?.participantId && southSeat).toBeTruthy();
  southSeat.participantId = westWinner.participantId;
  const outcome = { matchUpStatus: WALKOVER, winningSide: 1 };
  const params = { propagateExitStatus: true };
  const shape = { drawId, matchUpId: source.matchUpId, outcome, params, error: DRAW_POSITION_OCCUPIED };
  if (!relabelled) return { ...shape, tournamentRecord: record };

  // the source played, its loser seated in West and its winner played on: the walkover is then entered over the result
  tournamentEngine.setState(record);
  play(source.matchUpId);
  const [eastSecondRound] = inRound(
    tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps.filter((m) => m.structureName === 'East'),
    2,
  );
  play(eastSecondRound.matchUpId);
  return { ...shape, tournamentRecord: tournamentEngine.getTournament().tournamentRecord };
}

const SHAPES: [string, () => Shape][] = [
  ['the next matchUp is full and does not hold the winner', winnerSeatHeld],
  ['both seats of the loser link matchUp are taken', loserSeatHeld],
  ['they are taken and the matchUp stores a double exit', loserSeatHeldOverDoubleExit],
  ['a first-match feed has no assignment for its seat', fedSeatUnassigned],
  ['a carried exit meets taken seats a level on', () => carriedExitSeatHeld()],
  [
    'a result relabelled as an exit, its winner played on, would carry into taken seats',
    () => carriedExitSeatHeld(true),
  ],
];

describe.each(MODES)('pipeline %s', (mode) => {
  it.each(SHAPES)('where %s, the call is refused and nothing is written', (_name, shape) => {
    const { tournamentRecord, drawId, matchUpId, outcome, params, error } = shape();
    tournamentEngine.setState(tournamentRecord);
    setOutcomePipeline(mode);

    const before = structuredClone(tournamentEngine.getTournament().tournamentRecord);
    let result: any = tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome, ...params });
    expect(result.error?.code).toEqual(error.code);
    expect(tournamentEngine.getTournament().tournamentRecord).toEqual(before);
  });

  it('CONTROL: the loser is seated and the call accepted where the seat is free', () => {
    const { tournamentRecord, drawId, matchUpId, outcome } = loserSeatHeld(false);
    tournamentEngine.setState(tournamentRecord);
    setOutcomePipeline(mode);
    expect(tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome }).success).toEqual(true);
  });
});
