import { matchUpIsScored } from '@Mutate/matchUps/matchUpStatus/reconcileScoredTimes';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, RETIRED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS, FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';

/**
 * **A matchUp that loses its result loses its `scoredTime`, wherever in the draw it is.**
 *
 * A carried exit re-enters `setMatchUpState`, which stamps `schedule.scoredTime` on the consolation
 * matchUp it lands on. Clearing the exit at its origin unwinds that matchUp through writers that never
 * pass `applyScoredTime`, so it went back to `TO_BE_PLAYED` still claiming a score time — which the rest
 * and scheduling readers take as a finish. Found 2026-10-03 probing a carried RETIRED; WALKOVER and
 * DEFAULTED were identical.
 *
 * Each cell carries the exit, checks the consolation matchUp was stamped (the precondition), clears the
 * origin, and asserts no unscored matchUp in the draw keeps a stamp. The scored matchUp elsewhere in the
 * draw keeps its own: the reconciliation removes only stale stamps.
 */
const drawId = 'scored-time';
const flags = { propagateExitStatus: true, propagateRetirementAsExit: true };
const outcomes: Record<string, any> = {
  [WALKOVER]: { matchUpStatus: WALKOVER, winningSide: 1 },
  [DEFAULTED]: { matchUpStatus: DEFAULTED, winningSide: 1 },
  [RETIRED]: {
    matchUpStatus: RETIRED,
    winningSide: 1,
    score: { sets: [{ side1Score: 3, side2Score: 1 }], scoreStringSide1: '3-1', scoreStringSide2: '1-3' },
  },
};
const stored = () => {
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  return drawDefinition.structures.flatMap((structure: any) => structure.matchUps ?? []);
};
const staleStamps = () => stored().filter((m: any) => m.schedule?.scoredTime && !matchUpIsScored(m));

const CELLS = [FEED_IN_CHAMPIONSHIP, COMPASS].flatMap((drawType) =>
  [WALKOVER, DEFAULTED, RETIRED].map((matchUpStatus) => ({ drawType, matchUpStatus })),
);

it.each(CELLS)(
  '$drawType: a $matchUpStatus cleared at its origin leaves no stale scoredTime',
  ({ drawType, matchUpStatus }) => {
    setSubscriptions({});
    mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawType, drawSize: 16, drawId }], setState: true });
    const main = drawType === COMPASS ? 'East' : 'Main';
    const firstRound = tournamentEngine
      .allDrawMatchUps({ drawId, inContext: true })
      .matchUps.filter((m: any) => m.structureName === main && m.roundNumber === 1);
    const [origin, played] = [firstRound[0], firstRound[3]];

    let result: any = tournamentEngine.setMatchUpStatus({
      drawId,
      matchUpId: played.matchUpId,
      outcome: { winningSide: 2 },
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.setMatchUpStatus({
      ...flags,
      drawId,
      matchUpId: origin.matchUpId,
      outcome: outcomes[matchUpStatus],
    });
    expect(result.success).toEqual(true);

    // the precondition: a matchUp beyond the origin was stamped by the carried exit
    const stamped = stored().filter((m: any) => m.schedule?.scoredTime);
    expect(stamped.map((m: any) => m.matchUpId)).toEqual(expect.arrayContaining([origin.matchUpId, played.matchUpId]));
    expect(stamped.length).toBeGreaterThan(2);

    result = tournamentEngine.setMatchUpStatus({
      ...flags,
      drawId,
      matchUpId: origin.matchUpId,
      outcome: { matchUpStatus: TO_BE_PLAYED, score: { scoreStringSide1: '', scoreStringSide2: '' } },
    });
    expect(result.success).toEqual(true);

    expect(staleStamps().map((m: any) => m.matchUpId)).toEqual([]);
    const kept = stored().find((m: any) => m.matchUpId === played.matchUpId);
    expect(kept.schedule?.scoredTime).toBeDefined();
  },
);
