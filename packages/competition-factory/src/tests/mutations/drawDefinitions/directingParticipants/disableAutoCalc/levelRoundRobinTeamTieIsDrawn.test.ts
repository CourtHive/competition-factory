import { resolveTieFormat, tieFormatConstants } from '@courthive/competition-catalogue';
import { firstClassOrExtension } from '@Helpers/extensions/firstClassOrExtension';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { COMPLETED, IN_PROGRESS, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { ROUND_ROBIN, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { TALLY } from '@Constants/extensionConstants';

const { INTENNSE_2026 } = tieFormatConstants;

/**
 * A ROUND ROBIN TEAM TIE WHOSE LINES ALL FINISH LEVEL IS A DRAW: COMPLETED,
 * no winner, the aggregate kept, and the group tally counts it drawn for both teams. A single matchUp that ends level in
 * a format that can end level is the same. In elimination a winner must advance, so the tie stays in progress until a
 * decider or a recorded decision names one.
 *
 * INTENNSE 2026 decides a tie by `aggregateValue`. Every segment scored level stands the tie 140-140.
 */
function setup(drawType: string) {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, drawType, eventType: TEAM_EVENT, tieFormat: resolveTieFormat(INTENNSE_2026) }],
    setState: true,
  });
  const { drawId } = tournamentEngine.getTournament().tournamentRecord.events[0].drawDefinitions[0];
  expect(tournamentEngine.generateLineUps({ drawId, attach: true, useDefaultEventRanking: true }).success).toBe(true);
  const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: true });
  const tie = matchUps.find(
    (matchUp) =>
      matchUp.matchUpType === TEAM_MATCHUP && matchUp.roundNumber === 1 && matchUp.sides.every((s) => s.participantId),
  );
  const segments = matchUps.filter(({ matchUpTieId }) => matchUpTieId === tie.matchUpId);
  return { tie, segments };
}

const levelSets = (matchUpFormat: string) =>
  matchUpFormat.startsWith('SET2')
    ? [
        { setNumber: 1, side1Score: 10, side2Score: 10 },
        { setNumber: 2, side1Score: 10, side2Score: 10 },
      ]
    : [{ setNumber: 1, side1Score: 20, side2Score: 20 }];

function score(segment, sets = levelSets(segment.matchUpFormat), winningSide?: number) {
  const result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: COMPLETED, winningSide, score: { sets } },
    matchUpId: segment.matchUpId,
    drawId: segment.drawId,
  });
  expect(result.success).toEqual(true);
}

function readTie({ drawId, matchUpId }) {
  return tournamentEngine.findMatchUp({ drawId, matchUpId, inContext: true }).matchUp;
}

function groupTallies(tie) {
  const { tournamentRecord } = tournamentEngine.getTournament();
  const group = tournamentRecord.events[0].drawDefinitions[0].structures[0].structures.find((structure) =>
    structure.matchUps.some(({ matchUpId }) => matchUpId === tie.matchUpId),
  );
  const sideIds = tie.sides.map(({ participantId }) => participantId);
  return sideIds.map((participantId) => {
    const assignment = group.positionAssignments.find((a) => a.participantId === participantId);
    return firstClassOrExtension({ element: assignment, name: TALLY, attribute: 'tally' });
  });
}

describe('a level round robin TEAM tie', () => {
  it('is COMPLETED with no winner once every line has finished level', () => {
    const { tie, segments } = setup(ROUND_ROBIN);
    for (const segment of segments) score(segment);

    const after = readTie(tie);
    expect(after.matchUpStatus).toEqual(COMPLETED);
    expect(after.winningSide).toBeUndefined();
    expect(after.score.scoreStringSide1).toEqual('140-140');
    expect(after.score.scoreStringSide2).toEqual('140-140');
  });

  it('stays IN_PROGRESS while a line is still to be played, even with the aggregate level', () => {
    const { tie, segments } = setup(ROUND_ROBIN);
    for (const segment of segments.slice(0, -1)) score(segment);

    const after = readTie(tie);
    expect(after.matchUpStatus).toEqual(IN_PROGRESS);
    expect(after.winningSide).toBeUndefined();
  });

  // the last line has a winner, so v2 plans it itself (its `winner` route) rather than handing it to v1: its projection of
  // the dual must read the draw too (`projectedDualStatus`), or the two pipelines disagree
  it('is a draw when the last line has a winner and the aggregate still ends level', () => {
    const { tie, segments } = setup(ROUND_ROBIN);
    const singles = segments.filter(({ matchUpFormat }) => matchUpFormat.startsWith('SET1'));
    const [first, last] = [singles[0], singles[singles.length - 1]];
    for (const segment of segments) if (segment !== first && segment !== last) score(segment);
    score(first, [{ setNumber: 1, side1Score: 21, side2Score: 20 }], 1);
    expect(readTie(tie).matchUpStatus).toEqual(IN_PROGRESS);
    score(last, [{ setNumber: 1, side1Score: 20, side2Score: 21 }], 2);

    const after = readTie(tie);
    expect(after.matchUpStatus).toEqual(COMPLETED);
    expect(after.winningSide).toBeUndefined();
    expect(after.score.scoreStringSide1).toEqual('141-141');
    for (const tally of groupTallies(tie)) expect(tally.matchUpsDrawn).toEqual(1);
  });

  it('is tallied as a draw for both teams', () => {
    const { tie, segments } = setup(ROUND_ROBIN);
    for (const segment of segments) score(segment);

    const tallies = groupTallies(tie);
    for (const tally of tallies) {
      expect(tally.matchUpsDrawn).toEqual(1);
      expect(tally.matchUpsWon).toEqual(0);
      expect(tally.matchUpsLost).toEqual(0);
      expect([tally.gamesWon, tally.gamesLost]).toEqual([140, 140]);
    }
  });

  it('returns to IN_PROGRESS, and leaves the tally, when a line is cleared', () => {
    const { tie, segments } = setup(ROUND_ROBIN);
    for (const segment of segments) score(segment);

    const last = segments[segments.length - 1];
    const result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: TO_BE_PLAYED, score: { sets: [] } },
      matchUpId: last.matchUpId,
      drawId: last.drawId,
    });
    expect(result.success).toEqual(true);

    const after = readTie(tie);
    expect(after.matchUpStatus).toEqual(IN_PROGRESS);
    expect(after.winningSide).toBeUndefined();
    for (const tally of groupTallies(tie)) expect(tally?.matchUpsDrawn ?? 0).toEqual(0);
  });

  it('is unchanged when the last line breaks the level aggregate: the tie has a winner', () => {
    const { tie, segments } = setup(ROUND_ROBIN);
    for (const segment of segments.slice(0, -1)) score(segment);
    const last = segments[segments.length - 1];
    const sets = levelSets(last.matchUpFormat).map((set, index) => (index ? set : { ...set, side1Score: 21 }));
    score(last, sets, 1);

    const after = readTie(tie);
    expect(after.matchUpStatus).toEqual(COMPLETED);
    expect(after.winningSide).toEqual(1);
  });

  it('can still be given a winner by a recorded decision', () => {
    const { tie, segments } = setup(ROUND_ROBIN);
    for (const segment of segments) score(segment);

    const decision = { decidedIn: 'EXTERNAL', decidedBy: { method: 'OFFICIAL_DECISION' } };
    const result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: COMPLETED, winningSide: 1, score: { overtime: decision } },
      matchUpId: tie.matchUpId,
      drawId: tie.drawId,
      disableAutoCalc: true,
    });
    expect(result.success).toEqual(true);

    const after = readTie(tie);
    expect(after.matchUpStatus).toEqual(COMPLETED);
    expect(after.winningSide).toEqual(1);
    expect(after.score.scoreStringSide1).toEqual('140-140');
    const [first, second] = groupTallies(tie);
    expect([first.matchUpsWon, first.matchUpsDrawn ?? 0]).toEqual([1, 0]);
    expect([second.matchUpsLost, second.matchUpsDrawn ?? 0]).toEqual([1, 0]);
  });
});

it('a level elimination TEAM tie stays IN_PROGRESS: a winner must advance', () => {
  const { tie, segments } = setup(SINGLE_ELIMINATION);
  for (const segment of segments) score(segment);

  const after = readTie(tie);
  expect(after.matchUpStatus).toEqual(IN_PROGRESS);
  expect(after.winningSide).toBeUndefined();
  expect(after.score.scoreStringSide1).toEqual('140-140');
});
