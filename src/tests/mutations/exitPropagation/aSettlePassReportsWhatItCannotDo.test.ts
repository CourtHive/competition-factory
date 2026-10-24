import { reconcileMissedLinkAdvancements } from '@Mutate/matchUps/matchUpStatus/reconcileMissedLinkAdvancements';
import { reconcileLinkAdvancements } from '@Mutate/matchUps/matchUpStatus/reconcileLinkAdvancements';
import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { resetDifferentialTally } from '@Mutate/matchUps/outcome/differential';
import { afterEach, describe, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants
import { OUTCOME_PIPELINE_DIFFERENTIAL, OUTCOME_PIPELINE_V1 } from '@Constants/outcomePipelineConstants';
import { SETTLE_BOUND_REACHED } from '@Constants/errorConditionConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

/**
 * A SETTLE PASS REPORTS WHAT IT CANNOT DO (outcome v2 executor plan, Phase C prerequisite 2 and F9 (i); CA 2026-10-24).
 *
 * `reconcileMissedLinkAdvancements` dropped the error of the direction it makes, and `reconcileLinkAdvancements`
 * stopped silently at its bound. Neither was reached on ~97,000 census schedules (settle telemetry, 2026-10-24). Each
 * now returns what it could not do, and `setMatchUpStatus` refuses the call on it, comparing it under `differential`.
 *
 * Each is planted: the inner direction made to fail, the bound made to hold work. A draw built for the purpose shows the
 * pass reaching that point on its own first (the control).
 */
const planted = vi.hoisted(() => ({ direct: false, unearned: false, missed: false, linked: false, calls: 0 }));
const plantedError = { error: { code: 'ERR_PLANTED', message: 'planted' } };

vi.mock('@Mutate/matchUps/drawPositions/drawPositionPlacement', async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, directWinner: (args: any) => (planted.direct ? plantedError : actual.directWinner(args)) };
});

vi.mock('@Query/drawDefinition/getUnearnedLinkAdvancements', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    // always one fewer than the last ask: every pass releases something, and something is always left
    getUnearnedLinkAdvancements: (args: any) => {
      if (!planted.unearned) return actual.getUnearnedLinkAdvancements(args);
      planted.calls += 1;
      return Array.from({ length: 100_000 - planted.calls }, () => ({ link: { source: {} }, participantId: 'p' }));
    },
  };
});

vi.mock('@Mutate/matchUps/drawPositions/releaseLinkedWinnerAdvancement', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    releaseLinkedWinnerAdvancement: (args: any) =>
      planted.unearned ? undefined : actual.releaseLinkedWinnerAdvancement(args),
  };
});

vi.mock('@Mutate/matchUps/matchUpStatus/reconcileMissedLinkAdvancements', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    reconcileMissedLinkAdvancements: (args: any) =>
      planted.missed ? plantedError : actual.reconcileMissedLinkAdvancements(args),
  };
});

vi.mock('@Mutate/matchUps/matchUpStatus/reconcileLinkAdvancements', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    reconcileLinkAdvancements: (args: any) =>
      planted.linked ? { error: SETTLE_BOUND_REACHED } : actual.reconcileLinkAdvancements(args),
  };
});

afterEach(() => {
  Object.assign(planted, { direct: false, unearned: false, missed: false, linked: false, calls: 0 });
  setOutcomePipeline();
  setSubscriptions({});
});

const DRAW_ID = 'de';
const allMatchUps = (): any[] => tournamentEngine.allDrawMatchUps({ drawId: DRAW_ID, inContext: true }).matchUps;
const grandFinal = () => allMatchUps().find((matchUp) => matchUp.structureName === 'Main' && matchUp.roundNumber === 4);
const drawDefinition = () => tournamentEngine.getEvent({ drawId: DRAW_ID }).drawDefinition;

/** DOUBLE_ELIMINATION 8/8, played up to the grand final, which its two finalists now hold */
function playToGrandFinal() {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: DOUBLE_ELIMINATION, drawSize: 8, drawId: DRAW_ID }],
    nonRandom: 7001,
    setState: true,
  });
  for (let guard = 0; guard < 50; guard++) {
    const next = allMatchUps()
      .filter(
        (matchUp) =>
          matchUp.structureName !== 'Decider' &&
          matchUp.matchUpId !== grandFinal().matchUpId &&
          matchUp.matchUpStatus === TO_BE_PLAYED &&
          matchUp.sides?.filter((side: any) => side.participantId).length === 2,
      )
      .sort((a, b) => a.roundNumber - b.roundNumber || a.roundPosition - b.roundPosition)[0];
    if (!next) break;
    tournamentEngine.setMatchUpStatus({ matchUpId: next.matchUpId, drawId: DRAW_ID, outcome: { winningSide: 1 } });
  }
  // CONTROL: both finalists are seated
  expect(grandFinal().sides.filter((side: any) => side.participantId)).toHaveLength(2);
}

/** take the Backdraw champion's seat out of the grand final, as a crossing that was never made */
function unseatTheBackdrawChampion() {
  const { tournamentRecord } = tournamentEngine.getTournament();
  const draw = tournamentRecord.events[0].drawDefinitions[0];
  const main = draw.structures.find((structure: any) => structure.structureName === 'Main');
  const final = main.matchUps.find((matchUp: any) => matchUp.roundNumber === 4);
  const backdrawSide = grandFinal().sides.find((side: any) => side.sideNumber === 2);
  final.drawPositions = final.drawPositions.filter((position: number) => position !== backdrawSide.drawPosition);
  tournamentEngine.setState(tournamentRecord);
  expect(grandFinal().sides.filter((side: any) => side.participantId)).toHaveLength(1);
}

describe('reconcileMissedLinkAdvancements returns the error of the direction it makes', () => {
  it('re-seats a champion whose crossing was missed (control)', () => {
    playToGrandFinal();
    unseatTheBackdrawChampion();
    const { tournamentRecord } = tournamentEngine.getTournament({ convertExtensions: false });
    const draw = tournamentRecord.events[0].drawDefinitions[0];
    const result = reconcileMissedLinkAdvancements({ tournamentRecord, drawDefinition: draw });
    expect(result?.error).toBeUndefined();
    tournamentEngine.setState(tournamentRecord);
    expect(grandFinal().sides.filter((side: any) => side.participantId)).toHaveLength(2);
  });

  it('returns the direction refused, where it used to drop it', () => {
    playToGrandFinal();
    unseatTheBackdrawChampion();
    planted.direct = true;
    const result: any = reconcileMissedLinkAdvancements({ drawDefinition: drawDefinition() });
    expect(result?.error?.code).toEqual('ERR_PLANTED');
  });
});

describe('reconcileLinkAdvancements refuses at its bound', () => {
  it('returns SETTLE_BOUND_REACHED when every pass releases something and something is always left', () => {
    playToGrandFinal();
    planted.unearned = true;
    const result: any = reconcileLinkAdvancements({ drawDefinition: drawDefinition() });
    expect(result?.error).toEqual(SETTLE_BOUND_REACHED);
    // CONTROL: it asked once per pass and once more, a pass per matchUp and one over
    expect(planted.calls).toBeGreaterThan(allMatchUps().length);
  });
});

describe.each([
  ['reconcileMissedLinkAdvancements', 'missed'],
  ['reconcileLinkAdvancements', 'linked'],
] as const)('setMatchUpStatus refuses when %s reports', (_name, site) => {
  const code = site === 'missed' ? 'ERR_PLANTED' : SETTLE_BOUND_REACHED.code;
  const scoreAFirstRound = () => {
    setSubscriptions({});
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: DOUBLE_ELIMINATION, drawSize: 8, drawId: DRAW_ID }],
      nonRandom: 7001,
      setState: true,
    });
    const first = allMatchUps().find((matchUp) => matchUp.structureName === 'Main' && matchUp.roundNumber === 1);
    return () =>
      tournamentEngine.setMatchUpStatus({ matchUpId: first.matchUpId, drawId: DRAW_ID, outcome: { winningSide: 1 } });
  };

  it('under v1, with the error', () => {
    const enter = scoreAFirstRound();
    setOutcomePipeline(OUTCOME_PIPELINE_V1);
    planted[site] = true;
    const result: any = enter();
    expect(result.error?.code).toEqual(code);
  });

  it('under differential, as a divergence: v2 planned the success', () => {
    const enter = scoreAFirstRound();
    setOutcomePipeline(OUTCOME_PIPELINE_DIFFERENTIAL);
    resetDifferentialTally();
    planted[site] = true;
    expect(enter).toThrow(new RegExp(`v1 ${code}, v2 ok`));
  });
});
