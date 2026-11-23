import { setMatchUpStatus } from '@Mutate/matchUps/matchUpStatus/setMatchUpStatus';
import { withdrawnAwardRelease } from '@Mutate/matchUps/outcome/settlement/release';
import { predictSettlement } from '@Mutate/matchUps/outcome/settlement';
import { buildOutcomeView } from '@Mutate/matchUps/outcome/view';
import { chooseRoute } from '@Mutate/matchUps/outcome/route';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { getOutcomePipeline, setOutcomePipeline } from '@Global/state/globalState';
import { FEED_IN_CHAMPIONSHIP, FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { WALKOVER, TO_BE_PLAYED, DEFAULTED } from '@Constants/matchUpStatusConstants';
import type { OutcomeRequest } from '@Mutate/matchUps/outcome/types';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it } from 'vitest';
const entryMode = getOutcomePipeline();
afterEach(() => setOutcomePipeline(entryMode));

function make(
  drawType: typeof FEED_IN_CHAMPIONSHIP | typeof FIRST_MATCH_LOSER_CONSOLATION,
  status: typeof WALKOVER | typeof DEFAULTED,
) {
  setOutcomePipeline('v1');
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType, drawSize: 8 }],
    nonRandom: 1,
  });
  const event = tournamentRecord.events[0],
    drawDefinition = event.drawDefinitions[0];
  const args = { event, drawDefinition, tournamentRecord };
  const first = drawDefinition.structures[0].matchUps.filter((m) => m.roundNumber === 1);
  const matchUpId = first[0].matchUpId;
  const played = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-2 6-1', winningSide: 1 }).outcome;
  expect(
    setMatchUpStatus({ ...args, matchUpId: first[1].matchUpId, outcome: played, propagateExitStatus: true }),
  ).toMatchObject({ success: true });
  expect(
    setMatchUpStatus({
      ...args,
      matchUpId,
      outcome: { matchUpStatus: status, winningSide: 1 },
      propagateExitStatus: true,
    }),
  ).toMatchObject({ success: true });
  const request: OutcomeRequest = {
    matchUpId,
    matchUpStatus: TO_BE_PLAYED,
    flags: { propagateExitStatus: true, propagateRetirementAsExit: false },
  };
  const certify = () => {
    const matchUpsMap = getMatchUpsMap({ drawDefinition });
    const view = buildOutcomeView({ ...args, request, matchUpsMap });
    return withdrawnAwardRelease(view, request, chooseRoute(request, view), drawDefinition);
  };
  return { args, request, certify };
}

it.each([
  [FEED_IN_CHAMPIONSHIP, WALKOVER],
  [FIRST_MATCH_LOSER_CONSOLATION, DEFAULTED],
] as const)('preserves the independent result-key shape on the held onward seat in %s after %s', (drawType, status) => {
  const { args, request, certify } = make(drawType, status);
  const grant = certify();
  expect(grant).toBeDefined();
  const original = structuredClone(args.drawDefinition);
  const model = predictSettlement({ ...args, request });
  expect(args.drawDefinition).toStrictEqual(original);
  expect(model.ops).toContainEqual(grant!.op);
  const byId = (drawDefinition: typeof args.drawDefinition, id: string) =>
    getMatchUpsMap({ drawDefinition }).drawMatchUps.find((m) => m.matchUpId === id)!;
  const onwardId = grant!.onward.matchUpId;
  const old = byId(args.drawDefinition, onwardId);
  const next = byId(model.drawDefinition, onwardId);
  expect(old.drawPositions).toContain(grant!.position);
  expect(next.drawPositions).not.toContain(grant!.position);
  expect(Object.hasOwn(next, 'score')).toBe(Object.hasOwn(old, 'score'));
  expect(Object.hasOwn(next, 'winningSide')).toBe(Object.hasOwn(old, 'winningSide'));
  expect(
    setMatchUpStatus({
      ...args,
      matchUpId: request.matchUpId!,
      outcome: { matchUpStatus: TO_BE_PLAYED },
      propagateExitStatus: true,
    }),
  ).toMatchObject({ success: true });
  expect(next.drawPositions).toStrictEqual(old.drawPositions);
  expect(Object.keys(next)).toEqual(Object.keys(old));
});

it.each(['foreign marker', 'changed awardee', 'independent score', 'position absent'])(
  'declines a derivative release with %s',
  (fault) => {
    const { args, certify } = make(FEED_IN_CHAMPIONSHIP, WALKOVER);
    const grant = certify()!;
    const matches = getMatchUpsMap({ drawDefinition: args.drawDefinition }).drawMatchUps;
    const holder = matches.find((m) => m.matchUpId === grant.holder.matchUpId)!;
    const onward = matches.find((m) => m.matchUpId === grant.onward.matchUpId)!;
    if (fault === 'foreign marker') holder.sideExitProvenance![3 - holder.winningSide!].sourceMatchUpId = 'foreign';
    if (fault === 'changed awardee') holder.winningSide = holder.winningSide === 1 ? 2 : 1;
    if (fault === 'independent score') onward.score = { sets: [{ side1Score: 4, side2Score: 2 }] };
    if (fault === 'position absent') onward.drawPositions = onward.drawPositions!.filter((p) => p !== grant.position);
    expect(certify()).toBeUndefined();
  },
);
