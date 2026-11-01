import { isDirectingMatchUpStatus, isNonDirectingMatchUpStatus } from '@Query/matchUp/checkStatusType';
import { getDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { setOutcomePipeline } from '@Global/state/globalState';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants
import { BYE, DEFAULTED, RETIRED, validMatchUpStatuses, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { AD_HOC } from '@Constants/drawDefinitionConstants';
import { TEAM } from '@Constants/eventConstants';
import {
  INVALID_MATCHUP_STATUS,
  INVALID_MATCHUP_STATUS_BYE,
  MISSING_ASSIGNMENTS,
  MISSING_DRAW_POSITIONS,
} from '@Constants/errorConditionConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';

/**
 * S7: the status and assignment codes that were apply-stage codes (deferred: v2 accepting while v1 refused) are v2's
 * own refusals, asked where v1's writers ask them, after the dispatch and before their first write (`refuseRoute`).
 * Each shape below is refused with the same code under v1, v2 and the differential, which compares the two (no
 * deferral); and the record is unchanged. `UNRECOGNIZED_MATCHUP_STATUS` has no shape: § 3's `unrecognized` and `not
 * directing` rows are not reached past row 6, which the first test asserts of the status lists themselves.
 * `MISSING_ASSIGNMENTS` stays an apply-stage code: its one reach from `setMatchUpStatus` is a line under manual
 * scoring (item 3, v1's), pinned last as the deferral it is.
 */
afterEach(() => setOutcomePipeline(OUTCOME_PIPELINE_V1));

const MODES: OutcomePipelineMode[] = [OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL];
const score = { sets: [{ setNumber: 1, side1Score: 3, side2Score: 2 }] };

type Shape = {
  /** the draw; `participantsCount` below `drawSize` seats byes */
  profile: Record<string, unknown>;
  /** the matchUp the call names, among the draw's in-context matchUps */
  pick: (matchUps: any[]) => any;
  outcome: Record<string, unknown>;
  policyDefinitions?: Record<string, unknown>;
};

const r1 = (matchUps: any[]) =>
  matchUps.find((matchUp) => matchUp.roundNumber === 1 && matchUp.sides.every((side: any) => side.participantId));
const r2 = (matchUps: any[]) => matchUps.find((matchUp) => matchUp.roundNumber === 2);
const r2Dual = (matchUps: any[]) => matchUps.find((matchUp) => matchUp.roundNumber === 2 && matchUp.tieMatchUps);
const r2Line = (matchUps: any[]) => r2Dual(matchUps).tieMatchUps[0];

function refusedAlike({ profile, pick, outcome, policyDefinitions }: Shape, code: string) {
  const deferred = () => Object.keys(getDifferentialTally()).filter((key) => key.startsWith('refusal:deferred:'));
  for (const mode of MODES) {
    setOutcomePipeline(OUTCOME_PIPELINE_V1);
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId: 'd', ...profile }],
      ...(policyDefinitions ? { policyDefinitions } : {}),
      nonRandom: 1,
      setState: true,
    });
    const matchUp = pick(tournamentEngine.allDrawMatchUps({ drawId: 'd', inContext: true }).matchUps);
    const before = canonicalJson(tournamentEngine.getTournament().tournamentRecord);
    const comparedBefore = getDifferentialTally().refusal?.compared ?? 0;
    const deferredBefore = JSON.stringify(deferred().map((key) => [key, getDifferentialTally()[key]]));
    setOutcomePipeline(mode);
    const result: any = tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId: matchUp.matchUpId, outcome });
    expect([mode, result.error?.code]).toEqual([mode, code]);
    expect(canonicalJson(tournamentEngine.getTournament().tournamentRecord)).toEqual(before);
    if (mode === OUTCOME_PIPELINE_DIFFERENTIAL) {
      // compared, the two refusals agreeing: not deferred under any code
      expect(getDifferentialTally().refusal?.compared).toEqual(comparedBefore + 1);
      expect(JSON.stringify(deferred().map((key) => [key, getDifferentialTally()[key]]))).toEqual(deferredBefore);
    }
  }
}

it('every valid status is directing or non-directing: § 3 has no unrecognized status to reach past row 6', () => {
  const unclassified = validMatchUpStatuses.filter(
    (matchUpStatus) => !isDirectingMatchUpStatus({ matchUpStatus }) && !isNonDirectingMatchUpStatus({ matchUpStatus }),
  );
  expect(unclassified).toEqual([]);
});

describe('row 28: a BYE on a matchUp without a bye seat', () => {
  it('in a draw with no byes', () => {
    refusedAlike(
      { profile: { drawSize: 8 }, pick: r1, outcome: { matchUpStatus: BYE } },
      INVALID_MATCHUP_STATUS_BYE.code,
    );
  });
  it('in a draw of 7, beside the matchUp that holds the bye', () => {
    refusedAlike(
      { profile: { drawSize: 8, participantsCount: 7 }, pick: r1, outcome: { matchUpStatus: BYE } },
      INVALID_MATCHUP_STATUS_BYE.code,
    );
  });
  it('CONTROL: the matchUp holding the bye is not refused', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId: 'd', drawSize: 8, participantsCount: 7 }],
      nonRandom: 1,
      setState: true,
    });
    const bye = tournamentEngine
      .allDrawMatchUps({ drawId: 'd' })
      .matchUps.find((matchUp: any) => matchUp.matchUpStatus === BYE);
    const result: any = tournamentEngine.setMatchUpStatus({
      drawId: 'd',
      matchUpId: bye.matchUpId,
      outcome: { matchUpStatus: BYE },
    });
    expect(result.error).toBeUndefined();
  });
});

describe("row 6's fallthrough: an exit named with no winner", () => {
  it.each([WALKOVER, DEFAULTED, RETIRED])('%s', (matchUpStatus) => {
    refusedAlike({ profile: { drawSize: 8 }, pick: r1, outcome: { matchUpStatus } }, INVALID_MATCHUP_STATUS.code);
  });
});

describe("row 24's removal clause: a score with no winner on a matchUp holding no drawPositions", () => {
  it('a second-round matchUp nobody has reached', () => {
    refusedAlike({ profile: { drawSize: 8 }, pick: r2, outcome: { score } }, MISSING_DRAW_POSITIONS.code);
  });
  it('a second-round TEAM dual nobody has reached', () => {
    refusedAlike(
      { profile: { eventType: TEAM, drawSize: 4 }, pick: r2Dual, outcome: { score } },
      MISSING_DRAW_POSITIONS.code,
    );
  });
  it("a line of that dual: the dual's drawPositions are read", () => {
    refusedAlike(
      { profile: { eventType: TEAM, drawSize: 4 }, pick: r2Line, outcome: { score } },
      MISSING_DRAW_POSITIONS.code,
    );
  });
  it('a line of that dual under requireParticipantsForScoring: false, which relaxes row 6 and not this', () => {
    refusedAlike(
      {
        profile: { eventType: TEAM, drawSize: 4 },
        pick: r2Line,
        outcome: { score },
        policyDefinitions: { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } },
      },
      MISSING_DRAW_POSITIONS.code,
    );
  });
  it('CONTROL: an ad hoc matchUp holds no drawPositions and is not refused', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId: 'd', drawSize: 8, drawType: AD_HOC, roundsCount: 1, automated: true }],
      nonRandom: 1,
      setState: true,
    });
    const matchUp = tournamentEngine.allDrawMatchUps({ drawId: 'd' }).matchUps[0];
    expect(matchUp.drawPositions).toBeUndefined();
    for (const mode of MODES) {
      setOutcomePipeline(mode);
      const result: any = tournamentEngine.setMatchUpStatus({
        drawId: 'd',
        matchUpId: matchUp.matchUpId,
        outcome: { score },
      });
      expect([mode, result.error]).toEqual([mode, undefined]);
    }
  });
});

describe('MISSING_ASSIGNMENTS stays an apply-stage code: a manual-scoring line, deferred', () => {
  /** the dual's auto-calc disabled, its lines v1's (`attemptToModifyScore`, whose `validToScore` refuses) */
  function manualDual(roundNumber: 1 | 2) {
    setOutcomePipeline(OUTCOME_PIPELINE_V1);
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId: 'd', eventType: TEAM, drawSize: 4 }],
      nonRandom: 1,
      setState: true,
    });
    const dual = tournamentEngine
      .allDrawMatchUps({ drawId: 'd', inContext: true })
      .matchUps.find((matchUp: any) => matchUp.roundNumber === roundNumber && matchUp.tieMatchUps);
    if (roundNumber === 1)
      expect(
        tournamentEngine.removeDrawPositionAssignment({
          drawId: 'd',
          structureId: dual.structureId,
          drawPosition: dual.drawPositions[1],
        }).success,
      ).toEqual(true);
    const disabled: any = tournamentEngine.setMatchUpStatus({
      drawId: 'd',
      matchUpId: dual.matchUpId,
      disableAutoCalc: true,
    });
    expect(disabled.success).toEqual(true);
    return dual;
  }

  it.each([
    ['a seat of the dual unassigned', 1],
    ['the dual unfed (no drawPositions): the removal clause of row 24 is not asked of a manual-scoring line', 2],
  ] as [string, 1 | 2][])("a line's bare score, %s", (_label, roundNumber) => {
    const deferredCount = () => getDifferentialTally()['refusal:deferred:ERR_MISSING_ASSIGNMENTS']?.deferred ?? 0;
    for (const mode of MODES) {
      const dual = manualDual(roundNumber);
      const before = deferredCount();
      setOutcomePipeline(mode);
      const result: any = tournamentEngine.setMatchUpStatus({
        drawId: 'd',
        matchUpId: dual.tieMatchUps[0].matchUpId,
        outcome: { score },
      });
      // v1's, under v2 too (the line is abstained `team`: manual scoring is item 3's)
      expect([mode, result.error?.code]).toEqual([mode, MISSING_ASSIGNMENTS.code]);
      if (mode === OUTCOME_PIPELINE_DIFFERENTIAL) expect(deferredCount()).toEqual(before + 1);
    }
  });
});
