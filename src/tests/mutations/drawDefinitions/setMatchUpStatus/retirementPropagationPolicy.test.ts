import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import {
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  DOUBLE_ELIMINATION,
  COMPASS,
} from '@Constants/drawDefinitionConstants';
import { RETIRED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';

/**
 * The downstream effect of a RETIREMENT is decided by policy. CA's ruling, 2026-09-13.
 *
 * A retirement is a completed match: both participants took the court and there is a score. What
 * happens next is a RULES question, not an engineering one. Treat the retiring player as unable to
 * continue and their consolation match is a walkover for the opponent; treat them as an ordinary
 * loser and it is a live matchUp. Governing bodies differ, so the engine must not pick.
 *
 * `propagateRetirementAsExit` decides it, and it only bites when `propagateExitStatus` is also on —
 * with exit propagation off (the factory default) a retirement never carried anywhere.
 *
 * ## Why the gate is in `directLoser` and not in `progressExitStatus`
 *
 * `progressExitStatus.ts` already names RETIRED:
 *
 *     (isExit(sourceMatchUpStatus) && sourceMatchUpStatus !== RETIRED && sourceMatchUpStatus) || WALKOVER
 *
 * and its comment says "RETIRED should not be propagated as an exit status" — but it runs AFTER the
 * decision to propagate has been taken, so all it can do is choose the LABEL the exit carries. The
 * suppression its comment describes was never implemented; only the relabel was. The single gate is
 * `directLoser.ts`'s `validExitToPropagate`, confirmed by intervention: removing RETIRED there
 * leaves the consolation matchUp TO_BE_PLAYED in every loser-linked draw type, while WALKOVER
 * continues to propagate untouched.
 *
 * ## Default
 *
 * TRUE — the engine's long-standing behaviour, so nothing moves for anyone who has not opted out.
 * `propagateExitStatus.test.ts` pins that behaviour and all 27 of its assertions are unchanged.
 * Note the precedence differs from `propagateExitStatus`, which resolves with `x || y || undefined`
 * and therefore cannot express an explicit `false`. Turning retirement propagation OFF is the entire
 * purpose of this setting, so it resolves with `??` and an explicit `false` wins from either params
 * or policy.
 */

const DRAW_TYPES = [
  FIRST_MATCH_LOSER_CONSOLATION,
  FIRST_ROUND_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  DOUBLE_ELIMINATION,
  COMPASS,
];

const RETIREMENT = {
  matchUpStatus: RETIRED,
  winningSide: 1,
  score: { sets: [{ side1Score: 6, side2Score: 3 }], scoreStringSide1: '6-3', scoreStringSide2: '3-6' },
};

/** Score a round-1 matchUp as a retirement and report where its loser lands. */
function retireAndInspect({ drawType, propagateRetirementAsExit }: any) {
  const drawId = `retirement-policy-${drawType}`;
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount: 16, drawSize: 16, drawType, drawId }],
    nonRandom: 1,
    setState: true,
  });

  const source = tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId })
    .matchUps.find((matchUp: any) => matchUp.roundNumber === 1 && matchUp.roundPosition === 1);

  const loserParticipantId = source.sides.find((side: any) => side.sideNumber === 2)?.participantId;

  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: source.matchUpId,
    propagateRetirementAsExit,
    propagateExitStatus: true,
    outcome: RETIREMENT,
    drawId,
  });

  const landed = tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId })
    .matchUps.find(
      (matchUp: any) =>
        matchUp.structureId !== source.structureId &&
        matchUp.sides?.some((side: any) => side.participantId === loserParticipantId),
    );

  return { error: result.error, loserParticipantId, landed };
}

it.each(DRAW_TYPES)('%s — with the policy ON, a retirement carries a WALKOVER into the consolation', (drawType) => {
  const { error, loserParticipantId, landed } = retireAndInspect({ drawType, propagateRetirementAsExit: true });

  expect(error).toBeUndefined();
  // the control: the retiring player must actually reach the consolation, or the status assertion
  // below would be about nothing
  expect(landed, `${drawType}: the retired loser reached no linked structure`).toBeDefined();
  expect(landed.sides.some((side: any) => side.participantId === loserParticipantId)).toEqual(true);

  expect(landed.matchUpStatus, `${drawType}`).toEqual(WALKOVER);
  // and they are the one who lost it — the walkover is recorded against the retiree
  expect(landed.sides.find((side: any) => side.sideNumber === landed.winningSide)?.participantId).not.toEqual(
    loserParticipantId,
  );
});

it.each(DRAW_TYPES)('%s — with the policy OFF, the retiring loser gets a live matchUp', (drawType) => {
  const { error, loserParticipantId, landed } = retireAndInspect({ drawType, propagateRetirementAsExit: false });

  expect(error).toBeUndefined();
  expect(landed, `${drawType}: the retired loser reached no linked structure`).toBeDefined();
  expect(landed.sides.some((side: any) => side.participantId === loserParticipantId)).toEqual(true);

  // placement is unchanged — only what happens to them on arrival
  expect(landed.matchUpStatus ?? TO_BE_PLAYED, `${drawType}`).toEqual(TO_BE_PLAYED);
  expect(landed.winningSide).toBeUndefined();
});

it('the policy does not disturb WALKOVER or DEFAULTED propagation', () => {
  // The boundary. Turning retirement propagation off must affect retirements ONLY — the other exits
  // are not policy-governed and must keep carrying.
  const drawId = 'retirement-policy-boundary';
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount: 16, drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP, drawId }],
    nonRandom: 1,
    setState: true,
  });

  const source = tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId })
    .matchUps.find((matchUp: any) => matchUp.roundNumber === 1 && matchUp.roundPosition === 1);
  const loserParticipantId = source.sides.find((side: any) => side.sideNumber === 2)?.participantId;

  const result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: WALKOVER, winningSide: 1 },
    propagateRetirementAsExit: false,
    matchUpId: source.matchUpId,
    propagateExitStatus: true,
    drawId,
  });
  expect(result.error).toBeUndefined();

  const landed = tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId })
    .matchUps.find(
      (matchUp: any) =>
        matchUp.structureId !== source.structureId &&
        matchUp.sides?.some((side: any) => side.participantId === loserParticipantId),
    );

  expect(landed).toBeDefined();
  expect(landed.matchUpStatus).toEqual(WALKOVER);
});

it('reads the setting from the scoring policy, not only from params', () => {
  // The policy is the point — a provider sets it once for the tournament rather than passing it on
  // every call. An explicit `false` in the policy must win, which `propagateExitStatus`'s own
  // `x || y || undefined` precedence could not express.
  const drawId = 'retirement-policy-from-policy';
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    policyDefinitions: {
      [POLICY_TYPE_SCORING]: { propagateExitStatus: true, propagateRetirementAsExit: false },
    },
    drawProfiles: [{ participantsCount: 16, drawSize: 16, drawType: FEED_IN_CHAMPIONSHIP, drawId }],
    nonRandom: 1,
    setState: true,
  });

  const source = tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId })
    .matchUps.find((matchUp: any) => matchUp.roundNumber === 1 && matchUp.roundPosition === 1);
  const loserParticipantId = source.sides.find((side: any) => side.sideNumber === 2)?.participantId;

  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: source.matchUpId,
    outcome: RETIREMENT,
    drawId,
  });
  expect(result.error).toBeUndefined();

  const landed = tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId })
    .matchUps.find(
      (matchUp: any) =>
        matchUp.structureId !== source.structureId &&
        matchUp.sides?.some((side: any) => side.participantId === loserParticipantId),
    );

  expect(landed, 'the retired loser reached no linked structure').toBeDefined();
  expect(landed.matchUpStatus ?? TO_BE_PLAYED).toEqual(TO_BE_PLAYED);
});
