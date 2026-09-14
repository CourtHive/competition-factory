import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { COMPLETED, DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * The feed-eligibility guard, defined as much by what it must NOT refuse as by what it must.
 *
 * `FIRST_MATCH_LOSER_CONSOLATION` admits a loser only with zero prior SCORED wins, and a walkover or
 * unscored default is not a scored win. So re-scoring an EARLIER matchUp can move a participant
 * across that line after the feed decision was made, in either direction — `DROPPED_PROGRESSION` one
 * way, `INELIGIBLE_PROGRESSION` the other. Both are refused now, per CA 2026-09-14: a TD correcting
 * a result with active downstream dependencies is refused rather than silently re-fed.
 *
 * THE REFUSAL HAD TO BE MADE NARROW, and an earlier attempt shows why. Refusing on any
 * scored/unscored flip in any draw holding a `FIRST_MATCHUP` link closed the same census seeds and
 * wrongly blocked seven classes of legitimate correction, every one of them reproduced. The census
 * could not see any of it, because the census plays FMLC main rounds and nothing else. The cases
 * below are that list, and they are the reason each condition in the guard exists.
 */

const coordinates = (item: any) => `${item.structureName}|${item.roundNumber}|${item.roundPosition}`;

function generate({
  drawId,
  drawType = FIRST_MATCH_LOSER_CONSOLATION,
  drawSize = 16,
  participantsCount = 16,
  seed = 20260914,
}: any) {
  // `nonRandom` is not optional here: without it every run draws a different bracket, and one of
  // these assertions passed or failed depending on which score the generated matchUpFormat accepted
  const { drawIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount, drawSize, drawType, drawId }],
    nonRandom: seed,
    setState: true,
  });
  expect(drawIds).toContain(drawId);
  setSubscriptions({});
}

function play(drawId: string, coordinate: string, outcome: any) {
  const matchUps = tournamentEngine.allDrawMatchUps({ inContext: true, drawId })?.matchUps ?? [];
  const target = matchUps.find((matchUp: any) => coordinates(matchUp) === coordinate);
  expect(target, `no matchUp at ${coordinate}`).toBeDefined();
  const result: any = tournamentEngine.setMatchUpStatus({ matchUpId: target.matchUpId, outcome, drawId });
  return result?.error?.code;
}

/** play every round-1 matchUp that has two participants, so round 2 becomes playable */
function playRoundOne(drawId: string) {
  const matchUps = tournamentEngine.allDrawMatchUps({ inContext: true, drawId })?.matchUps ?? [];
  for (const matchUp of matchUps.filter((m: any) => m.structureName === 'Main' && m.roundNumber === 1)) {
    if ((matchUp.sides ?? []).filter((side: any) => side?.participantId).length !== 2) continue;
    if (matchUp.winningSide) continue;
    tournamentEngine.setMatchUpStatus({ matchUpId: matchUp.matchUpId, outcome: { winningSide: 1 }, drawId });
  }
}

it('REFUSES downgrading a win to a walkover once the winner has lost the feeding round', () => {
  const drawId = 'feed-refuse';
  generate({ drawId });
  playRoundOne(drawId);
  // the round-1 winner of Main|1|1 now LOSES round 2, so their eligibility is already decided
  expect(play(drawId, 'Main|2|1', { winningSide: 2 })).toBeUndefined();

  expect(play(drawId, 'Main|1|1', { matchUpStatus: WALKOVER, winningSide: 1 })).toEqual(
    'ERR_CANNOT_CHANGE_FEED_ELIGIBILITY',
  );
});

it('REFUSES the mirror — correcting a walkover to a real win', () => {
  const drawId = 'feed-refuse-mirror';
  generate({ drawId });
  expect(play(drawId, 'Main|1|1', { matchUpStatus: WALKOVER, winningSide: 1 })).toBeUndefined();
  playRoundOne(drawId);
  expect(play(drawId, 'Main|2|1', { winningSide: 2 })).toBeUndefined();

  // a bare winningSide is written as COMPLETED, which IS a scored win
  expect(play(drawId, 'Main|1|1', { winningSide: 1 })).toEqual('ERR_CANNOT_CHANGE_FEED_ELIGIBILITY');
});

it('ALLOWS the same correction where no feed rule exists (SINGLE_ELIMINATION)', () => {
  // an unconfined version of this guard broke recoveryTimeReport.test.ts exactly here
  const drawId = 'feed-se';
  generate({ drawId, drawType: SINGLE_ELIMINATION });
  playRoundOne(drawId);
  expect(play(drawId, 'Main|2|1', { winningSide: 2 })).toBeUndefined();

  expect(play(drawId, 'Main|1|1', { matchUpStatus: WALKOVER, winningSide: 1 })).toBeUndefined();
});

it('ALLOWS the correction when no feed decision exists yet — the feeding round is unplayed', () => {
  const drawId = 'feed-undecided';
  generate({ drawId });
  playRoundOne(drawId);
  // Main|2|1 deliberately NOT played

  expect(play(drawId, 'Main|1|1', { matchUpStatus: WALKOVER, winningSide: 1 })).toBeUndefined();
});

it('ALLOWS the correction when the participant WON the feeding round rather than losing it', () => {
  const drawId = 'feed-won';
  generate({ drawId });
  playRoundOne(drawId);
  // the round-1 winner of Main|1|1 WINS round 2, so they never became a first-match loser
  expect(play(drawId, 'Main|2|1', { winningSide: 1 })).toBeUndefined();

  expect(play(drawId, 'Main|1|1', { matchUpStatus: WALKOVER, winningSide: 1 })).toBeUndefined();
});

it('ALLOWS a change in the FEEDING round itself, and in rounds beyond it', () => {
  const drawId = 'feed-rounds';
  generate({ drawId });
  playRoundOne(drawId);
  expect(play(drawId, 'Main|2|1', { winningSide: 2 })).toBeUndefined();
  expect(play(drawId, 'Main|2|2', { winningSide: 1 })).toBeUndefined();
  expect(play(drawId, 'Main|3|1', { winningSide: 1 })).toBeUndefined();

  // round 3 cannot contribute to any first-match win count
  expect(play(drawId, 'Main|3|1', { matchUpStatus: WALKOVER, winningSide: 1 })).toBeUndefined();
});

it('ALLOWS adding a score to an existing DEFAULTED — the win count does not move', () => {
  const drawId = 'feed-score-added';
  generate({ drawId });
  expect(
    play(drawId, 'Main|1|1', {
      matchUpStatus: DEFAULTED,
      winningSide: 1,
      score: { sets: [{ side1Score: 6, side2Score: 1 }] },
    }),
  ).toBeUndefined();
  playRoundOne(drawId);
  expect(play(drawId, 'Main|2|1', { winningSide: 2 })).toBeUndefined();

  // a scored DEFAULTED counts as a win before and after, so nothing downstream can change
  expect(
    play(drawId, 'Main|1|1', {
      matchUpStatus: DEFAULTED,
      winningSide: 1,
      score: { sets: [{ side1Score: 6, side2Score: 2 }] },
    }),
  ).toBeUndefined();
});

it('ALLOWS a correction in a CONSOLATION structure — never the source of the feed link', () => {
  const drawId = 'feed-consolation';
  generate({ drawId });
  playRoundOne(drawId);
  expect(play(drawId, 'Main|2|1', { winningSide: 2 })).toBeUndefined();
  expect(play(drawId, 'Consolation|1|1', { winningSide: 1 })).toBeUndefined();

  expect(play(drawId, 'Consolation|1|1', { matchUpStatus: WALKOVER, winningSide: 1 })).toBeUndefined();
});

it('the request and the record are judged by ONE rule — an omitted matchUpStatus is not the old one', () => {
  // `{winningSide, score}` with no matchUpStatus is the ordinary score-entry shape; the engine writes
  // COMPLETED. A guard reading the REQUEST would see the status being replaced and answer
  // differently from the same call with COMPLETED spelled out.
  const omitted = 'feed-omitted';
  generate({ drawId: omitted });
  play(omitted, 'Main|1|1', { matchUpStatus: WALKOVER, winningSide: 1 });
  playRoundOne(omitted);
  play(omitted, 'Main|2|1', { winningSide: 2 });
  const withoutStatus = play(omitted, 'Main|1|1', { winningSide: 1 });

  const spelled = 'feed-spelled';
  generate({ drawId: spelled });
  play(spelled, 'Main|1|1', { matchUpStatus: WALKOVER, winningSide: 1 });
  playRoundOne(spelled);
  play(spelled, 'Main|2|1', { winningSide: 2 });
  const withStatus = play(spelled, 'Main|1|1', { matchUpStatus: COMPLETED, winningSide: 1 });

  expect(withoutStatus).toEqual('ERR_CANNOT_CHANGE_FEED_ELIGIBILITY');
  expect(withStatus).toEqual(withoutStatus);
});
