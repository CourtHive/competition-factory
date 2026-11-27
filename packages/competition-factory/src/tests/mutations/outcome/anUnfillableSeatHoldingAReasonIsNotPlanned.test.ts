import { deleteNotices, setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

import {
  getDifferentialTally,
  OutcomePipelineDivergence,
  resetDifferentialTally,
} from '@Mutate/matchUps/outcome/differential';

// constants
import { MODIFY_DRAW_DEFINITION, MODIFY_MATCHUP, MODIFY_POSITION_ASSIGNMENTS } from '@Constants/topicConstants';
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { CURTIS_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';

/**
 * A SEAT A PRODUCED EXIT LEAVES UNFILLABLE IS PLANNED ONLY OVER A MATCHUP THAT HOLDS NOTHING.
 *
 * Two first-round double exits in CURTIS_CONSOLATION 16 (`doubleExitPropagateBye: false`) produce an exit whose loser
 * seat, in the play-off for 3rd and 4th, nobody can fill: v1 places a BYE there with no event, and v2 plans that BYE and
 * its chain (`unfillableByeChain`) only when the matchUp it lands in holds no result, no provenance and no reason. The
 * reason check read `record.reasons`, a field the view's own records carry but a hydrated matchUp does not, so it was
 * always undefined and a matchUp holding a reason was planned as if it held none. It now asks `holdsReasons`, as the
 * other hydrated reads in the planner do. A record handed to the engine can hold a reason there (here the play-off
 * matchUp carries one before the second double exit): v2 no longer plans the double exit's direction through the
 * converged write, and leaves it to v1's writers. Every mode leaves the same record, results and notices either way.
 */

afterEach(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setClock();
});

/** how differential recorded the double exit's direction: planned whole by v2, and through the converged write */
const direction = () => {
  const tally = getDifferentialTally();
  return { direction: tally['double-exit:direction'], converged: tally['double-exit:converged'] };
};
const TOPICS = [MODIFY_MATCHUP, MODIFY_DRAW_DEFINITION, MODIFY_POSITION_ASSIGNMENTS];
const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const matchUpAt = (coordinate: string) =>
  tournamentEngine.allDrawMatchUps({ drawId: 'd', inContext: true }).matchUps.find((m: any) => key(m) === coordinate);

function play(
  mode: OutcomePipelineMode,
  { drawSize, flavour, reason }: { drawSize: number; flavour: string; reason?: boolean },
) {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setClock('2026-11-27T00:00:00.000Z');
  setSubscriptions({ subscriptions: {} });
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    policyDefinitions: { [POLICY_TYPE_PROGRESSION]: { propagateExitStatus: true, doubleExitPropagateBye: false } },
    drawProfiles: [{ drawType: CURTIS_CONSOLATION, drawSize, participantsCount: drawSize, drawId: 'd', idPrefix: 'm' }],
    nonRandom: 9000230,
  });
  tournamentEngine.setState(tournamentRecord);
  const first: any = tournamentEngine.setMatchUpStatus({
    matchUpId: matchUpAt('Main|1|1').matchUpId,
    outcome: { matchUpStatus: flavour },
    drawId: 'd',
  });

  // the record handed back holds a reason on the play-off matchUp the second double exit's unfillable seat reaches
  const record = tournamentEngine.getTournament().tournamentRecord;
  const playOff = record.events[0].drawDefinitions[0].structures
    .flatMap((structure: any) => structure.matchUps ?? [])
    .find((matchUp: any) => matchUp.matchUpId === 'm-p3t4-1-1');
  if (reason) playOff.sideStatusCodes = { 1: 'W1' };
  tournamentEngine.setState(record);
  const held = { matchUpStatus: playOff.matchUpStatus, sideExitProvenance: playOff.sideExitProvenance };

  deleteNotices();
  const notices: string[] = [];
  setSubscriptions({
    subscriptions: Object.fromEntries(
      TOPICS.map((topic) => [
        topic,
        (payloads: any[]) => payloads.forEach((p) => notices.push(`${topic} ${canonicalJson(p)}`)),
      ]),
    ),
  });
  setOutcomePipeline(mode);
  resetDifferentialTally();
  let result: any;
  let divergence: string | undefined;
  try {
    result = tournamentEngine.setMatchUpStatus({
      matchUpId: matchUpAt('Main|1|2').matchUpId,
      outcome: { matchUpStatus: flavour },
      drawId: 'd',
    });
  } catch (error) {
    if (!(error instanceof OutcomePipelineDivergence)) throw error;
    divergence = error.message;
  }
  const { stack: _stack, ...rest } = result ?? {};
  return {
    record: canonicalJson(tournamentEngine.getTournament().tournamentRecord),
    tally: mode === OUTCOME_PIPELINE_DIFFERENTIAL ? direction() : undefined,
    first: first.success,
    result: rest,
    divergence,
    notices,
    held,
  };
}

const ROWS = [DOUBLE_WALKOVER, DOUBLE_DEFAULT].map((flavour) => [
  `CURTIS_CONSOLATION 16, ${flavour}`,
  { drawSize: 16, flavour },
]) as [string, { drawSize: number; flavour: string }][];

describe('a seat a produced exit leaves unfillable is planned only over a matchUp that holds nothing', () => {
  it.each(ROWS)('%s, the play-off matchUp holding a reason', (_label, row) => {
    const v1 = play(OUTCOME_PIPELINE_V1, { ...row, reason: true });
    const v2 = play(OUTCOME_PIPELINE_V2, { ...row, reason: true });
    const differential = play(OUTCOME_PIPELINE_DIFFERENTIAL, { ...row, reason: true });

    // CONTROL: the play-off matchUp is the clean unfillable target the planner would take, but for the reason
    expect(v1.first).toEqual(true);
    expect(v1.held).toEqual({ matchUpStatus: TO_BE_PLAYED, sideExitProvenance: undefined });
    expect(v1.result.success).toEqual(true);

    // the double exit's direction is not planned through the converged write over the reason: v1's writers settle it
    expect(differential.tally).toEqual({ direction: { compared: 0, deferred: 1 }, converged: undefined });

    expect(v2.result).toEqual(v1.result);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
    expect(differential.divergence).toBeUndefined();
    expect(differential.record).toEqual(v1.record);
  });

  it.each(ROWS)('%s, the play-off matchUp holding nothing', (_label, row) => {
    // CONTROL: without the reason v2 plans the same direction through the converged write, and the modes agree
    const v1 = play(OUTCOME_PIPELINE_V1, row);
    const v2 = play(OUTCOME_PIPELINE_V2, row);
    const differential = play(OUTCOME_PIPELINE_DIFFERENTIAL, row);
    expect(differential.tally).toEqual({
      direction: { compared: 1, deferred: 0 },
      converged: { compared: 1, deferred: 0 },
    });
    expect(v2.result).toEqual(v1.result);
    expect(v2.record).toEqual(v1.record);
    expect(v2.notices).toEqual(v1.notices);
    expect(differential.divergence).toBeUndefined();
    expect(differential.record).toEqual(v1.record);
  });
});
