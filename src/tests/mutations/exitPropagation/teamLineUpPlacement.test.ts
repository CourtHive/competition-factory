import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { BYE, COMPLETED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { TEAM } from '@Constants/eventConstants';

/**
 * THREE DEFECTS THE TEAM MATRIX'S LINE ARM FOUND ON FIRST CONTACT — 2026-10-01 — each pinned alone.
 *
 * All three live in code no oracle had executed before the arm existed: the dual's winner projection,
 * the lineUp that travels with an advancing team, and the lineUp that travels with a directed loser.
 * `teamMatrix.test.ts` keeps the surface executed; this file says WHICH rule each cell was failing.
 */

const played = {
  score: {
    sets: [
      { side1Score: 6, side2Score: 3, winningSide: 1 },
      { side1Score: 6, side2Score: 3, winningSide: 1 },
    ],
  },
  winningSide: 1,
};

const all = (drawId: string): any[] => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [];
const dual = (drawId: string, structureName: string, roundNumber: number, roundPosition: number) =>
  all(drawId).find(
    (m) =>
      !m.collectionId &&
      m.structureName === structureName &&
      m.roundNumber === roundNumber &&
      m.roundPosition === roundPosition,
  );
const linesOf = (drawId: string, dualMatchUp: any) =>
  all(drawId).filter((m) => m.matchUpTieId === dualMatchUp.matchUpId && !m.winningSide);
const teams = (matchUp: any) => (matchUp.sides ?? []).map((side: any) => side.participantId).filter(Boolean);

function generate(drawId: string, drawType: string, seed: number) {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawType, drawSize: 8, eventType: TEAM, tieFormatName: DOMINANT_DUO }],
    nonRandom: seed,
    setState: true,
  });
  const lineUps: any = tournamentEngine.generateLineUps({ drawId, useDefaultEventRanking: true, attach: true });
  expect(lineUps.success).toEqual(true);
}

function scoreLines(drawId: string, dualMatchUp: any, count: number, outcome: any = played) {
  for (const line of linesOf(drawId, dualMatchUp).slice(0, count)) {
    const result: any = tournamentEngine.setMatchUpStatus({ matchUpId: line.matchUpId, drawId, outcome });
    expect(result.success).toEqual(true);
  }
}

/**
 * 1. A LINE ENTERED AS A BARE `{ winningSide }` DECIDES THE DUAL AND ADVANCES ITS WINNER.
 *
 * `getProjectedDualWinningSide` read "no score, no status" as a clear and projected the dual
 * undecided, while the write recorded the line COMPLETED and `updateTieMatchUpScore` completed the
 * dual — so `directParticipants`, gated on the projected winner changing, never advanced anybody.
 * Measured: COMPLETED 2-0, next round empty, WINNER_NOT_ADVANCED on 240 of 240 line-level cells.
 */
it('advances the dual winner when the deciding line carries only a winningSide', () => {
  const drawId = 'bare-line';
  generate(drawId, SINGLE_ELIMINATION, 300001);
  const first = dual(drawId, 'Main', 1, 1);

  scoreLines(drawId, first, 2, { winningSide: 1 });

  const decided = dual(drawId, 'Main', 1, 1);
  expect(decided.matchUpStatus).toEqual(COMPLETED);
  expect(decided.winningSide).toEqual(1);
  const [winner] = teams(decided);
  // THE DEFECT: the dual was decided and its winner stayed where they were
  expect(teams(dual(drawId, 'Main', 2, 1)), 'the winner reaches the next round').toEqual([winner]);
});

/**
 * 2. AN ADVANCING TEAM'S LINEUP LANDS ON THE SIDE THE TEAM HOLDS — side 2 of a feed round.
 *
 * `propagateLineUp` chose the target side by roundPosition arithmetic. `Consolation|1|1` →
 * `Consolation|2|1` is roundPosition 1 → 1, read as side 1 — the FED side of a feed round, where
 * the loser link's BYE then arrived holding the team's lineUp. Lines hydrated with one player on both
 * sides; the driver scored them; the dual was awarded to its BYE side.
 */
it("places an advancing team's lineUp on side 2 of a feed-round dual, never on the fed side", () => {
  const drawId = 'advancing-lineup';
  generate(drawId, FIRST_MATCH_LOSER_CONSOLATION, 300041);

  // two first-round losers meet in Consolation|1|1; its winner advances to Consolation|2|1, a feed round
  scoreLines(drawId, dual(drawId, 'Main', 1, 1), 2);
  scoreLines(drawId, dual(drawId, 'Main', 1, 2), 2);
  const consolationFirst = dual(drawId, 'Consolation', 1, 1);
  expect(teams(consolationFirst)).toHaveLength(2);
  scoreLines(drawId, consolationFirst, 2);

  const target = dual(drawId, 'Consolation', 2, 1);
  expect(target.feedRound).toEqual(true);
  const [advanced] = teams(target);
  expect(advanced).toBeDefined();

  const raw = tournamentEngine
    .getEvent({ drawId })
    .drawDefinition.structures.find((s: any) => s.structureName === 'Consolation')
    .matchUps.find((m: any) => m.matchUpId === target.matchUpId);
  const side1 = raw.sides?.find((s: any) => s.sideNumber === 1);
  const side2 = raw.sides?.find((s: any) => s.sideNumber === 2);
  // THE DEFECT: the lineUp sat on side 1, the fed seat nobody had arrived on yet
  expect(side1?.lineUp ?? [], 'the fed side holds no lineUp').toEqual([]);
  expect(side2?.lineUp?.length, "the advancing team's lineUp is on its own side").toBeGreaterThan(0);
  // and every line of the dual has a participant on side 2 only
  for (const line of all(drawId).filter((m) => m.matchUpTieId === target.matchUpId)) {
    expect(line.sides.find((s: any) => s.sideNumber === 1)?.participantId).toBeUndefined();
    expect(line.sides.find((s: any) => s.sideNumber === 2)?.participantId).toBeDefined();
  }
});

/**
 * 3. A WITHHELD FMLC LOSER'S LINEUP DOES NOT TRAVEL TO THE SEAT THAT RECEIVED A BYE INSTEAD.
 *
 * In a FIRST_MATCH_LOSER_CONSOLATION a second-round loser who already won a match is withheld from
 * the consolation and a BYE is placed on their seat. `directLoser` returned from that branch with
 * plain success, and the caller went on to propagate the loser's lineUp onto the seat anyway.
 */
it("does not propagate a withheld loser's lineUp onto the consolation BYE that replaced them", () => {
  const drawId = 'withheld-lineup';
  generate(drawId, FIRST_MATCH_LOSER_CONSOLATION, 300041);

  scoreLines(drawId, dual(drawId, 'Main', 1, 1), 2);
  scoreLines(drawId, dual(drawId, 'Main', 1, 2), 2);
  // both Main|2|1 teams have won a match, so its loser is withheld from the consolation
  const second = dual(drawId, 'Main', 2, 1);
  expect(teams(second)).toHaveLength(2);
  scoreLines(drawId, second, 2);

  const fed = dual(drawId, 'Consolation', 2, 1);
  const byeSide = fed.sides.find((s: any) => s.bye);
  expect(byeSide, 'the withheld loser is represented by a BYE').toBeDefined();

  const raw = tournamentEngine
    .getEvent({ drawId })
    .drawDefinition.structures.find((s: any) => s.structureName === 'Consolation')
    .matchUps.find((m: any) => m.matchUpId === fed.matchUpId);
  const rawByeSide = raw.sides?.find((s: any) => s.sideNumber === byeSide.sideNumber);
  // THE DEFECT: the loser's lineUp arrived on the BYE's side
  expect(rawByeSide?.lineUp ?? [], 'the BYE side holds no lineUp').toEqual([]);
  for (const line of all(drawId).filter((m) => m.matchUpTieId === fed.matchUpId)) {
    expect(line.sides.find((s: any) => s.sideNumber === byeSide.sideNumber)?.participantId).toBeUndefined();
  }
  expect([BYE, WALKOVER]).toContain(fed.matchUpStatus);
});
