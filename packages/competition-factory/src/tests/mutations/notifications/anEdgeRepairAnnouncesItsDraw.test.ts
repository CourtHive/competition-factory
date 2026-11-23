import { captureNotices, collectEntities, conformanceViolations } from './noticeConformance/harness';
import { announceGoesTo } from '@Mutate/matchUps/matchUpStatus/setMatchUpState';
import { addGoesTo, hasStoredGoesTo, holdGoesTo } from '@Query/matchUps/addGoesTo';
import { nextPlayable } from '@Tests/testHarness/exitPropagation/driver';
import { deleteNotices, getPayloads, setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { MODIFY_DRAW_DEFINITION, MODIFY_MATCHUP } from '@Constants/topicConstants';
import { CURTIS_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';

/**
 * A CALL THAT REPAIRS A DRAW'S MISSING EDGES ANNOUNCES THE DRAW ONCE, NOT EACH MATCHUP.
 *
 * CA, 2026-10-18: "Option 2 and document the decision in tasks. Missing edges are most likely from hand assembled
 * draws and themselves an edge case."
 *
 * A draw stored without `winnerMatchUpId` / `loserMatchUpId` is given them by the first `setMatchUpStatus` that reads
 * it (#5086), and a refused call writes them back (#5606). A call that succeeds sends one `MODIFY_DRAW_DEFINITION` for
 * the draw and no `MODIFY_MATCHUP` for a matchUp whose only change is an edge; the notice-coverage oracle counts that
 * draw notice as covering those edge-only changes, and nothing else.
 */

const DRAW_ID = 'edgeRepair';
const EDGE_FIELDS = new Set(['winnerMatchUpId', 'loserMatchUpId', 'finishingRound', 'finishingPositionRange']);

function strippedDraw() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: CURTIS_CONSOLATION, drawSize: 16, drawId: DRAW_ID }],
    nonRandom: 1,
  });
  let stripped = 0;
  for (const structure of tournamentRecord.events[0].drawDefinitions[0].structures) {
    for (const matchUp of structure.matchUps ?? []) {
      if (matchUp.winnerMatchUpId || matchUp.loserMatchUpId) stripped += 1;
      delete matchUp.winnerMatchUpId;
      delete matchUp.loserMatchUpId;
    }
  }
  // CONTROL: there were edges, and they are gone
  expect(stripped).toBeGreaterThan(0);
  tournamentEngine.setState(tournamentRecord);
  expect(storesEdges()).toEqual(false);
  return tournamentRecord;
}

const drawDefinitionNow = () => tournamentEngine.getEvent({ drawId: DRAW_ID }).drawDefinition;
const storesEdges = () => hasStoredGoesTo({ drawDefinition: drawDefinitionNow() });
const recordNow = () => structuredClone(tournamentEngine.getTournament().tournamentRecord);
const drawNotices = (notices: any[]) =>
  notices.filter(
    ({ topic, payload }) => topic === MODIFY_DRAW_DEFINITION && payload?.drawDefinition?.drawId === DRAW_ID,
  );

/** what `fn` buffers for the draw, called outside an engine, so nothing is delivered */
function bufferedDrawNotices(fn: () => void) {
  setSubscriptions({ subscriptions: { [MODIFY_DRAW_DEFINITION]: () => undefined } });
  deleteNotices();
  try {
    fn();
    return getPayloads({ topic: MODIFY_DRAW_DEFINITION }).filter(
      (payload) => payload?.drawDefinition?.drawId === DRAW_ID,
    );
  } finally {
    deleteNotices();
    setSubscriptions({ subscriptions: {} });
  }
}

/** the matchUps whose stored change, between two records, is in their edge fields alone */
function edgeOnlyChanges(before: any, after: any): string[] {
  const was = collectEntities(before).matchUp;
  const now = collectEntities(after).matchUp;
  return [...now.keys()].filter((matchUpId) => {
    const a = was.get(matchUpId) ?? {};
    const b = now.get(matchUpId) ?? {};
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    const moved = [...keys].filter((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]));
    return moved.length > 0 && moved.every((key) => EDGE_FIELDS.has(key));
  });
}

describe('a call that repairs a draw’s missing edges', () => {
  it('announces the draw once, and no matchUp whose only change is an edge', () => {
    strippedDraw();
    const before = recordNow();
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
    const matchUpId = nextPlayable(DRAW_ID).matchUpId;

    let result: any;
    const notices = captureNotices(() => {
      result = tournamentEngine.setMatchUpStatus({ outcome, matchUpId, drawId: DRAW_ID });
    });
    expect(result.success).toEqual(true);
    expect(storesEdges()).toEqual(true);
    const after = recordNow();

    // CONTROL: the call wrote edges onto matchUps it did not otherwise change
    const edgeOnly = edgeOnlyChanges(before, after);
    expect(edgeOnly.length).toBeGreaterThan(10);
    expect(edgeOnly).not.toContain(matchUpId);

    expect(drawNotices(notices)).toHaveLength(1);
    const announcedMatchUpIds = notices
      .filter(({ topic }) => topic === MODIFY_MATCHUP)
      .map(({ payload }) => payload?.matchUp?.matchUpId);
    // the scored matchUp is announced as itself; the edge-only ones are not
    expect(announcedMatchUpIds).toContain(matchUpId);
    expect(announcedMatchUpIds.filter((id) => edgeOnly.includes(id))).toEqual([]);

    // the coverage oracle counts the draw notice as covering the edge-only changes
    expect(conformanceViolations(before, after, notices)).toEqual([]);
  });

  it('announces nothing when it is refused, and stores nothing', () => {
    strippedDraw();
    const before = recordNow();
    const NINE_ALL = { winningSide: 1, score: { sets: [{ side1Score: 9, side2Score: 9 }] } };

    let result: any;
    const notices = captureNotices(() => {
      result = tournamentEngine.setMatchUpStatus({
        matchUpId: nextPlayable(DRAW_ID).matchUpId,
        outcome: NINE_ALL,
        drawId: DRAW_ID,
      });
    });
    expect(result.error).toBeDefined();
    expect(storesEdges()).toEqual(false);
    expect(recordNow()).toEqual(before);
    expect(drawNotices(notices)).toEqual([]);
  });

  it('announces the draw only when the edges were written: `announceGoesTo` asks the hold', () => {
    strippedDraw();
    const drawDefinition = drawDefinitionNow();
    const hold = holdGoesTo({ drawDefinition });
    expect(hold).toBeDefined();

    // nothing written yet: nothing announced
    expect(bufferedDrawNotices(() => announceGoesTo({ hold, drawDefinition }))).toEqual([]);

    // written: one notice for the draw
    expect(addGoesTo({ drawDefinition }).error).toBeUndefined();
    expect(hold?.written()).toEqual(true);
    expect(bufferedDrawNotices(() => announceGoesTo({ hold, drawDefinition }))).toHaveLength(1);

    // released: what was written is back, and nothing is owed
    hold?.release();
    expect(hold?.written()).toEqual(false);
    expect(hasStoredGoesTo({ drawDefinition })).toEqual(false);

    // a draw that stores its edges holds nothing, so nothing is announced
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 8 }] });
    expect(holdGoesTo({ drawDefinition: tournamentRecord.events[0].drawDefinitions[0] })).toBeUndefined();
  });

  it('the draw notice does not cover a real matchUp change: status, score or provenance still need their own', () => {
    strippedDraw();
    const before = recordNow();
    const after = structuredClone(before);
    const [structure] = after.events[0].drawDefinitions[0].structures;
    const [first, second] = structure.matchUps.filter((matchUp: any) => matchUp.roundNumber === 1);
    const [next] = structure.matchUps.filter((matchUp: any) => matchUp.roundNumber === 2);
    first.winnerMatchUpId = next.matchUpId; // an edge alone
    second.winnerMatchUpId = next.matchUpId; // an edge AND a result
    second.matchUpStatus = COMPLETED;
    second.winningSide = 1;
    const drawNotice = [
      { topic: MODIFY_DRAW_DEFINITION, payload: { drawDefinition: after.events[0].drawDefinitions[0] } },
    ];

    const violations = conformanceViolations(before, after, drawNotice);
    expect(violations.map(({ id }) => id)).toEqual([second.matchUpId]);
    // and without the draw notice, the edge alone is a violation too
    const unannounced = conformanceViolations(before, after, []).map(({ id }) => id);
    expect(unannounced).toEqual(expect.arrayContaining([first.matchUpId, second.matchUpId]));
  });
});
