import { withCapturedClock } from '@Tools/clock';
import { predictSettlement } from '@Mutate/matchUps/outcome/settlement';
import { holdsRelayedLoser } from '@Mutate/matchUps/outcome/settlement/byeRelaySupport';
import { claimEdges } from '@Mutate/matchUps/outcome/plan/placementClaims';
import { setMatchUpStatus } from '@Mutate/matchUps/matchUpStatus/setMatchUpStatus';
import { buildOutcomeView } from '@Mutate/matchUps/outcome/view';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { getOutcomePipeline, setOutcomePipeline } from '@Global/state/globalState';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { BYE, WALKOVER } from '@Constants/matchUpStatusConstants';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it } from 'vitest';

const pipeline = getOutcomePipeline();
afterEach(() => setOutcomePipeline(pipeline));

it('follows the losing entrant through a standing consolation BYE to the marked side', () => {
  setOutcomePipeline('v1');
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    nonRandom: 1,
    drawProfiles: [{ drawSize: 8, participantsCount: 7, drawType: FIRST_MATCH_LOSER_CONSOLATION }],
  });
  const event = tournamentRecord.events[0],
    drawDefinition = event.drawDefinitions[0];
  const ctx = { tournamentRecord, event, drawDefinition };
  const root = drawDefinition.structures[0].matchUps.find((m) => m.roundNumber === 1 && m.matchUpStatus !== BYE);
  const request = { matchUpId: root.matchUpId, flags: { propagateExitStatus: true, propagateRetirementAsExit: false } };
  const frame = () => ({
    drawDefinition,
    inContextDrawMatchUps: buildOutcomeView({ ...ctx, request, matchUpsMap: getMatchUpsMap(ctx) })
      .inContextDrawMatchUps!,
  });
  const cold = frame();
  const donor = cold.inContextDrawMatchUps.find(
    (m) =>
      m.roundNumber === 1 &&
      m.matchUpStatus !== BYE &&
      claimEdges(cold, m).targetMatchUps?.loserMatchUp?.matchUpStatus === BYE,
  );
  expect(donor).toBeDefined();
  expect(
    setMatchUpStatus({
      ...ctx,
      matchUpId: donor!.matchUpId,
      outcome: { matchUpStatus: WALKOVER, winningSide: 1 },
      propagateExitStatus: true,
    }),
  ).toMatchObject({ success: true });
  const active = frame(),
    found = active.inContextDrawMatchUps.find((m) => m.matchUpId === donor!.matchUpId)!;
  const relay = claimEdges(active, found).targetMatchUps!.loserMatchUp!;
  const target = claimEdges(active, relay).targetMatchUps!.winnerMatchUp!;
  const marked = Object.entries(target.sideExitProvenance ?? {}).find(
    ([, mark]) => mark.sourceMatchUpId === found.matchUpId,
  );
  expect(marked).toBeDefined();
  const [key, mark] = marked!;
  const holds = () => holdsRelayedLoser(active, target, Number(key), mark);
  expect(holds()).toBe(true);
  expect(holdsRelayedLoser(active, target, 3 - Number(key), mark)).toBe(false);
  expect(holdsRelayedLoser(active, target, Number(key), { ...mark, sourceMatchUpId: 'other' })).toBe(false);
  const mainNext = claimEdges(active, found).targetMatchUps!.winnerMatchUp!;
  expect(
    setMatchUpStatus({
      ...ctx,
      matchUpId: mainNext.matchUpId,
      outcome: { winningSide: 1, matchUpStatus: WALKOVER },
      propagateExitStatus: true,
    }),
  ).toMatchObject({ success: true });
  const converged = frame().inContextDrawMatchUps.find((m) => m.matchUpId === target.matchUpId)!;
  expect(converged.matchUpStatus).toBe('DOUBLE_WALKOVER');
  const outcome = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-2 6-3', winningSide: 1 }).outcome;
  const nextRequest = { ...request, matchUpId: mainNext.matchUpId, winningSide: 1 as const, score: outcome.score };
  const actual = structuredClone(ctx);
  withCapturedClock((capturedClock) => {
    const prediction = predictSettlement({
      ...ctx,
      request: nextRequest,
      capturedClock,
      topics: [],
      priorNotices: [],
      tracksModificationMarks: true,
      disableNotifications: false,
    });
    const result = setMatchUpStatus({
      ...actual,
      matchUpId: mainNext.matchUpId,
      outcome: { winningSide: 1, score: outcome.score },
      propagateExitStatus: true,
    });
    expect(result).toMatchObject({ success: true });
    expect(prediction.drawDefinition).toStrictEqual(actual.drawDefinition);
  });
  const physical = active.inContextDrawMatchUps.find((m) => m.matchUpId === relay.matchUpId)!;
  const vacancy = physical.sides!.find((s) => s.bye)!;
  vacancy.participantId = 'independent entrant';
  expect(holds()).toBe(false);
  delete vacancy.participantId;
  physical.matchUpStatus = WALKOVER;
  expect(holds()).toBe(false);
});
