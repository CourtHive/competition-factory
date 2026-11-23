import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A consolation exit that was PLAYED makes its source active; only a PROPAGATED one is inert.
 *
 * `CANNOT_CHANGE_WINNING_SIDE` already refuses a winner-changing re-score when something downstream
 * is active — `winningSideWithDownstreamDependencies`, reached from `resolveAndApplyOutcome` only
 * when `isActiveDownstream` says so. The guard was never missing. It was never REACHED, because
 * `isActiveDownstream` exempted the fed loser's matchUp whenever `isExit(matchUpStatus)` held, and
 * `isExit` is a STATUS test: true of a walkover a referee recorded exactly as readily as of one the
 * cascade produced.
 *
 * Measured on the scenario below (census seed 9000349, shrunk from 30 steps to 4): at the final
 * step the consolation matchUp had TWO occupied sides, a `winningSide`, and NO `sideExitProvenance`
 * — played, by two people — and was still classified as a propagated exit. So the Main re-score was
 * allowed, stripped the fed participant out of a consolation match they had already played, and
 * left it `EXIT_WITHOUT_LOSER`: a winningSide with nobody on the losing side.
 *
 * The discriminator is provenance, which the cascade stamps and nothing else does — the rule
 * `isActiveDownstream`'s own comment already states: *a status blocks only when it was earned at
 * this matchUp, never when it was propagated into it.*
 */

const coordinates = (item: any) => `${item.structureName}|${item.roundNumber}|${item.roundPosition}`;

/** `createdAt`/`updatedAt` excluded — a timestamp bump is not the mutation under test. */
function drawState(drawId: string): string {
  const strip = (value: any): any => {
    if (Array.isArray(value)) return value.map(strip);
    if (value && typeof value === 'object') {
      const result: any = {};
      for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
        if (key === 'createdAt' || key === 'updatedAt') continue;
        result[key] = strip(value[key]);
      }
      return result;
    }
    return value;
  };
  return JSON.stringify(strip(tournamentEngine.getEvent({ drawId })?.drawDefinition ?? null));
}

it('refuses a winner-changing re-score once the fed loser has PLAYED in the consolation', () => {
  const drawId = 'played-exit-active';
  const { drawIds } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ participantsCount: 27, drawSize: 32, drawType: FIRST_MATCH_LOSER_CONSOLATION, drawId }],
    nonRandom: 9000349,
    setState: true,
  });
  expect(drawIds).toContain(drawId);
  setSubscriptions({});

  const steps = [
    { structureName: 'Main', roundNumber: 1, roundPosition: 11, outcome: { winningSide: 2 } },
    // the Main matchUp whose loser feeds the consolation
    { structureName: 'Main', roundNumber: 2, roundPosition: 6, outcome: { matchUpStatus: DEFAULTED, winningSide: 1 } },
    // that fed loser now PLAYS in the consolation — and loses it
    {
      structureName: 'Consolation',
      roundNumber: 2,
      roundPosition: 6,
      outcome: { matchUpStatus: WALKOVER, winningSide: 2 },
    },
    // re-scoring the Main matchUp the other way would withdraw a participant from a match they have
    // already played
    { structureName: 'Main', roundNumber: 2, roundPosition: 6, outcome: { matchUpStatus: WALKOVER, winningSide: 2 } },
  ];

  const outcomes: any[] = [];
  let applied = 0;

  for (const step of steps) {
    const matchUps = tournamentEngine.allDrawMatchUps({ inContext: true, drawId })?.matchUps ?? [];
    const target = matchUps.find((matchUp: any) => coordinates(matchUp) === coordinates(step));
    if (!target) continue;
    applied++;

    const before = drawState(drawId);
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    outcomes.push({
      step: coordinates(step),
      error: result?.error?.code,
      mutated: before !== drawState(drawId),
    });
  }

  // The control: a scenario whose steps never matched would assert nothing at all.
  expect(applied).toEqual(steps.length);

  const [first, second, third, rescore] = outcomes;
  expect([first.error, second.error, third.error]).toEqual([undefined, undefined, undefined]);

  // the enshrined refusal, reached at last
  expect(rescore.error).toEqual('ERR_UNCHANGED_CANNOT_CHANGE_WINNING_SIDE');
  // and it refuses BEFORE writing — it was previously ERR_ACTIVE_DRAW_POSITION over a damaged draw
  expect(rescore.mutated).toEqual(false);

  // the corruption the old path left: an exit matchUp with a winningSide and no loser
  const integrity: any = tournamentEngine.getDrawInconsistencies({ drawId });
  expect(integrity?.inconsistencies ?? []).toEqual([]);
});
