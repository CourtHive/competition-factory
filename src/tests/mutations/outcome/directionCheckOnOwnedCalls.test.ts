import { getDifferentialTally, OutcomePipelineDivergence } from '@Mutate/matchUps/outcome/differential';
import { generateOutcomeFromScoreString } from '@Scoring/parse/outcomeFromScoreString';
import { setOutcomePipeline } from '@Global/state/globalState';
import { afterEach, describe, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants
import { OUTCOME_PIPELINE_DIFFERENTIAL, OUTCOME_PIPELINE_V1 } from '@Constants/outcomePipelineConstants';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { TEAM } from '@Constants/eventConstants';

/**
 * THE DIFFERENTIAL'S DIRECTION CHECK (§ 5 rule 1) IS THE PLANNERS': it holds a call the planners write to the direction
 * they state, and is not asked of a call recorded whole (CA, 2026-11-19), whose ops are v1's own write read off a copy
 * and compared with the record entire by the shadow.
 *
 * The planners' direction is made wrong here on purpose, after the plan is made and before the comparison: the winner
 * is stated into a matchUp it is not sent to. On a call the planners write the check throws; on a recorded call it is
 * not asked, and the call is compared by its shadow alone.
 */
const stated: { direction?: any; corrupt?: (direction: any) => void } = {};

vi.mock('@Mutate/matchUps/outcome/direction', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    planDirection: (...args: any[]) => {
      stated.direction = actual.planDirection(...args);
      return stated.direction;
    },
  };
});

// v1's writer runs between the plan and the comparison: the stated direction is made wrong there
vi.mock('@Mutate/matchUps/matchUpStatus/setMatchUpState', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    setMatchUpState: (...args: any[]) => {
      if (stated.direction && stated.corrupt) stated.corrupt(stated.direction);
      return actual.setMatchUpState(...args);
    },
  };
});

afterEach(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  stated.direction = undefined;
  stated.corrupt = undefined;
});

const DRAW_ID = 'd';
const matchUps = (): any[] => tournamentEngine.allDrawMatchUps({ drawId: DRAW_ID, inContext: true }).matchUps;
const tally = (key: string) => getDifferentialTally()[key] ?? { compared: 0, deferred: 0 };
const elsewhere = (direction: any) => {
  if (direction.winner) direction.winner = { ...direction.winner, matchUpId: 'not-the-next-matchUp' };
};

describe('the direction check', () => {
  it('fires on a call the planners write whose stated direction is wrong', () => {
    mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawId: DRAW_ID, drawSize: 4 }], setState: true });
    const [first] = matchUps();
    const outcome = generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 }).outcome;
    const before = JSON.stringify(tournamentEngine.getTournament().tournamentRecord);
    setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);

    // stated right, it is compared
    const compared = tally('winner:direction').compared;
    let result: any = tournamentEngine.setMatchUpStatus({ drawId: DRAW_ID, matchUpId: first.matchUpId, outcome });
    expect(result.success).toEqual(true);
    expect(tally('winner:direction').compared).toEqual(compared + 1);

    // stated wrong, it throws, and the record is put back as it was
    setOutcomePipeline(OUTCOME_PIPELINE_V1);
    tournamentEngine.setState(JSON.parse(before));
    setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
    stated.corrupt = elsewhere;
    let thrown: any;
    try {
      tournamentEngine.setMatchUpStatus({ drawId: DRAW_ID, matchUpId: first.matchUpId, outcome });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(OutcomePipelineDivergence);
    expect(thrown.v2).toContain('planned the winner into not-the-next-matchUp');
  });

  it('is not asked of a call recorded whole, which its shadow compares', () => {
    // a TEAM dual's winner changed, in a consolation draw, nothing played on: the planners state a direction for the
    // new winner and abstain, the call is recorded whole, and the direction they state is not asked of it
    mocksEngine.generateTournamentRecord({
      drawProfiles: [
        {
          drawType: FIRST_MATCH_LOSER_CONSOLATION,
          tieFormatName: DOMINANT_DUO,
          drawId: DRAW_ID,
          eventType: TEAM,
          drawSize: 8,
        },
      ],
      setState: true,
      nonRandom: 14,
    });
    tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId: DRAW_ID });
    const duals = matchUps().filter(
      (matchUp) => !matchUp.collectionId && matchUp.stage === 'MAIN' && matchUp.roundNumber === 1,
    );
    expect(duals.length).toBeGreaterThan(0);
    const before = JSON.stringify(tournamentEngine.getTournament().tournamentRecord);
    let recorded = 0;
    for (const dual of duals) {
      setOutcomePipeline(OUTCOME_PIPELINE_V1);
      tournamentEngine.setState(JSON.parse(before));
      let result: any = tournamentEngine.setMatchUpStatus({
        drawId: DRAW_ID,
        matchUpId: dual.matchUpId,
        outcome: { winningSide: 1 },
      });
      expect(result.success).toEqual(true);
      setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
      stated.direction = undefined;
      // whatever the planners state for it, wrong included
      stated.corrupt = elsewhere;
      const applied = tally('shadow:applied').compared;
      const deferred = tally('winner:direction').deferred;
      const compared = tally('winner:direction').compared;
      const call = { drawId: DRAW_ID, matchUpId: dual.matchUpId, outcome: { winningSide: 2 } };
      result = tournamentEngine.setMatchUpStatus(call);
      expect(result.success).toEqual(true);
      expect(stated.direction?.winner).toBeDefined();
      // the whole record was compared, and the direction was not
      expect(tally('shadow:applied').compared).toEqual(applied + 1);
      expect(tally('winner:direction').compared).toEqual(compared);
      if (tally('winner:direction').deferred === deferred + 1) recorded += 1;
    }
    expect(recorded).toBeGreaterThan(0);
  });
});

describe("the dual's direction check, where a line's result makes its dual's call", () => {
  // a TEAM SINGLE_ELIMINATION 4 whose first dual's lines are played one by one: the line that decides the dual makes the
  // dual's own call, and the planners state the dual's direction (`planDual`)
  const generateTeam = () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawId: DRAW_ID, drawSize: 4, eventType: TEAM, tieFormatName: DOMINANT_DUO }],
      setState: true,
    });
    tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId: DRAW_ID });
  };
  const dualOf = (roundPosition: number) =>
    matchUps().find(
      (matchUp) => !matchUp.collectionId && matchUp.roundNumber === 1 && matchUp.roundPosition === roundPosition,
    );
  const set = (matchUpId: string, outcome: any) =>
    tournamentEngine.setMatchUpStatus({ drawId: DRAW_ID, matchUpId, outcome });

  it('fires on a line the planners write whose dual direction is stated wrong', () => {
    generateTeam();
    const [first, second] = dualOf(1).tieMatchUps;
    expect(set(first.matchUpId, { winningSide: 1 }).success).toEqual(true);
    const before = JSON.stringify(tournamentEngine.getTournament().tournamentRecord);
    setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);

    // stated right, it is compared
    const compared = tally('winner:dual-direction').compared;
    let result: any = set(second.matchUpId, { winningSide: 1 });
    expect(result.success).toEqual(true);
    expect(tally('winner:dual-direction').compared).toEqual(compared + 1);

    // stated wrong, it throws
    setOutcomePipeline(OUTCOME_PIPELINE_V1);
    tournamentEngine.setState(JSON.parse(before));
    setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
    stated.corrupt = elsewhere;
    let thrown: any;
    try {
      set(second.matchUpId, { winningSide: 1 });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(OutcomePipelineDivergence);
    expect(thrown.v2).toContain('planned the winner into not-the-next-matchUp');
  });

  it('is not asked of a line recorded whole: neither the dual it projects nor its direction', () => {
    // a dual decided by its own call, then handed to the other side by a fresh line, the next dual full: recorded
    generateTeam();
    const lines = dualOf(1).tieMatchUps;
    expect(set(lines[2].matchUpId, { winningSide: 2 }).success).toEqual(true);
    expect(set(dualOf(1).matchUpId, { winningSide: 1 }).success).toEqual(true);
    expect(set(dualOf(2).matchUpId, { winningSide: 2 }).success).toEqual(true);
    setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
    stated.corrupt = elsewhere;
    const before = { dual: tally('winner:dual'), direction: tally('winner:dual-direction') };
    const applied = tally('shadow:applied').compared;
    const result: any = set(lines[0].matchUpId, { matchUpStatus: WALKOVER, winningSide: 2 });
    expect(result.success).toEqual(true);
    expect(stated.direction?.winner).toBeDefined();
    expect(tally('shadow:applied').compared).toEqual(applied + 1);
    expect(tally('winner:dual')).toEqual({ ...before.dual, deferred: before.dual.deferred + 1 });
    expect(tally('winner:dual-direction')).toEqual({
      ...before.direction,
      deferred: before.direction.deferred + 1,
    });
  });
});
