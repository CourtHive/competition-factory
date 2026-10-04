import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import {
  FIRST_ROUND_LOSER_CONSOLATION,
  FEED_IN_CHAMPIONSHIP,
  COMPASS,
  OLYMPIC,
} from '@Constants/drawDefinitionConstants';

/**
 * **Either origin of a converged double exit can be cleared while nothing downstream is active**
 * (CA, 2026-10-03: *"clearing either origin of a converged DOUBLE_EXIT cannot be refused if there is no
 * downstream active matchUp"*).
 *
 * Two first-round exits whose losers are fed into the same consolation matchUp converge there into a
 * double exit. Clearing either origin was refused `ERR_PROPAGATED_EXITS_DOWNSTREAM`, nothing having been
 * played: `hasPropagatedExitDownstream` exempted an exit only when EVERY carried side named the origin
 * being cleared, on the reasoning that withdrawing one of two would not restore the prior state.
 *
 * It does, and that is what each cell measures: the draw after clearing one origin must be the draw the
 * KEPT origin produces on its own. A re-derived status alone does not get there. As a double exit the
 * matchUp produced an exit a round further on and, where it feeds another loser structure (COMPASS,
 * OLYMPIC), BYEs in its loser's seats; as a single carried exit its carrier must instead be directed
 * onward carrying the exit. `settleRederivedDoubleExits` unwinds it completely and REPLAYS the kept
 * origin's carry through the forward path.
 */
const drawId = 'converged-origin';
const STRUCTURES = {
  [FEED_IN_CHAMPIONSHIP]: { main: 'Main', consolation: 'Consolation' },
  [FIRST_ROUND_LOSER_CONSOLATION]: { main: 'Main', consolation: 'Consolation' },
  [COMPASS]: { main: 'East', consolation: 'West' },
  [OLYMPIC]: { main: 'East', consolation: 'West' },
};
const clear = { matchUpStatus: TO_BE_PLAYED, score: { scoreStringSide1: '', scoreStringSide2: '' } };

const all = () => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
const state = () =>
  JSON.stringify(
    all()
      .map((m: any) => [
        `${m.structureName}|${m.roundNumber}|${m.roundPosition}`,
        m.matchUpStatus,
        m.winningSide ?? null,
        m.sides.map((side: any) => side.participantId ?? (side.bye ? 'BYE' : null)),
      ])
      .sort((a: any, b: any) => (a[0] < b[0] ? -1 : 1)),
  );
const inconsistencies = () =>
  getDrawInconsistencies({ drawDefinition: tournamentEngine.getEvent({ drawId }).drawDefinition }).inconsistencies?.map(
    (issue: any) => issue.issueType,
  ) ?? [];

/** generate the same draw and record `steps` (first-round roundPositions with an outcome) in order */
const play = (drawType: string, steps: [number, any][]) => {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType, drawSize: 16, drawId }],
    nonRandom: 4242,
    setState: true,
  });
  const { main } = STRUCTURES[drawType];
  const origin = (roundPosition: number) =>
    all().find((m: any) => m.structureName === main && m.roundNumber === 1 && m.roundPosition === roundPosition);
  return steps.map(
    ([roundPosition, outcome]) =>
      tournamentEngine.setMatchUpStatus({
        matchUpId: origin(roundPosition).matchUpId,
        propagateExitStatus: true,
        outcome,
        drawId,
      }) as any,
  );
};

const CELLS = [FEED_IN_CHAMPIONSHIP, FIRST_ROUND_LOSER_CONSOLATION, COMPASS, OLYMPIC].flatMap((drawType) =>
  [WALKOVER, DEFAULTED].flatMap((matchUpStatus) => [1, 2].map((cleared) => ({ drawType, matchUpStatus, cleared }))),
);

it.each(CELLS)(
  '$drawType: two $matchUpStatus origins converge; origin $cleared is cleared',
  ({ drawType, matchUpStatus, cleared }) => {
    const exit = { matchUpStatus, winningSide: 1 };
    const kept = 3 - cleared;

    // the draw the kept origin produces alone
    play(drawType, [[kept, exit]]);
    const keptAlone = state();

    const results = play(drawType, [
      [1, exit],
      [2, exit],
    ]);
    expect(results.map((result) => result.error)).toEqual([undefined, undefined]);
    // the precondition: both losers carried their exits into ONE consolation matchUp, which converged
    const { consolation } = STRUCTURES[drawType];
    expect(
      all().some(
        (m: any) => m.structureName === consolation && [DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(m.matchUpStatus),
      ),
    ).toEqual(true);
    const { main } = STRUCTURES[drawType];
    const origin = all().find(
      (m: any) => m.structureName === main && m.roundNumber === 1 && m.roundPosition === cleared,
    );
    const clearResult: any = tournamentEngine.setMatchUpStatus({
      matchUpId: origin.matchUpId,
      propagateExitStatus: true,
      outcome: clear,
      drawId,
    });

    expect(clearResult.error).toBeUndefined();
    expect(state()).toEqual(keptAlone);
    expect(inconsistencies()).toEqual([]);
  },
);
