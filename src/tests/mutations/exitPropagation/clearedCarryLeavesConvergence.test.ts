import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { OLYMPIC } from '@Constants/drawDefinitionConstants';

/**
 * **Clearing an exit takes its loser out of every structure the exit carried them into — including one
 * where their carried exit had converged with another.**
 *
 * Census seed 9000352 (OLYMPIC 16/16), three steps. `East|1|4` and `East|1|2` are each a WALKOVER; each
 * loser carries the exit into West, loses there to the vacant side, and is carried on into South — both
 * into `South|1|1`, where the two carried exits converge. Clearing `East|1|2` took its loser out of
 * West and left them in South, the WALKOVER winner of the other loser's carried exit: WINNER_NOT_ADVANCED.
 *
 * `withdrawProducedExits` runs before the loser is followed onward, and it re-derives the convergence as
 * a WALKOVER the stranded loser wins. `placementIsInert` read that as a result they earned. A carried
 * exit's `winningSide` belongs to the exit, not to whoever sits opposite it, so that placement is inert
 * for them too, and the walk now releases it.
 *
 * Both orders of clearing and both exit statuses: whichever is cleared, the other loser is left alone in
 * South holding the pending exit, and the draw is consistent.
 */
const drawId = 'cleared-carry';
const FIRST = 4;
const SECOND = 2;

const generate = () => {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: OLYMPIC, drawSize: 16, participantsCount: 16, drawId }],
    nonRandom: 9000352,
    setState: true,
  });
};
const getMatchUps = () => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
const eastFirstRound = (roundPosition: number) =>
  getMatchUps().find(
    (m: any) => m.structureName === 'East' && m.roundNumber === 1 && m.roundPosition === roundPosition,
  );
const holders = (structureName: string) => {
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structure = drawDefinition.structures.find((s: any) => s.structureName === structureName);
  return structure.positionAssignments.map((a: any) => a.participantId).filter(Boolean);
};
const inconsistencies = () => {
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  return getDrawInconsistencies({ drawDefinition }).inconsistencies?.map((i: any) => i.issueType) ?? [];
};
const record = (roundPosition: number, outcome: any) =>
  tournamentEngine.setMatchUpStatus({
    matchUpId: eastFirstRound(roundPosition).matchUpId,
    propagateExitStatus: true,
    outcome,
    drawId,
  });

const CELLS = [WALKOVER, DEFAULTED].flatMap((matchUpStatus) =>
  [FIRST, SECOND].map((cleared) => ({ matchUpStatus, cleared, kept: cleared === FIRST ? SECOND : FIRST })),
);

it.each(CELLS)(
  '$matchUpStatus at East|1|4 and East|1|2, East|1|$cleared cleared',
  ({ matchUpStatus, cleared, kept }) => {
    generate();
    const loserOf = (roundPosition: number) =>
      eastFirstRound(roundPosition).sides.find((side: any) => side.sideNumber === 2).participantId;
    const clearedLoser = loserOf(cleared);
    const keptLoser = loserOf(kept);

    let result: any = record(FIRST, { matchUpStatus, winningSide: 1 });
    expect(result.success).toEqual(true);
    result = record(SECOND, { matchUpStatus, winningSide: 1 });
    expect(result.success).toEqual(true);
    // the precondition: both losers were carried through West into South
    expect(holders('South')).toEqual(expect.arrayContaining([clearedLoser, keptLoser]));

    result = record(cleared, { matchUpStatus: TO_BE_PLAYED, score: { scoreStringSide1: '', scoreStringSide2: '' } });
    expect(result.success).toEqual(true);

    expect(holders('West')).not.toContain(clearedLoser);
    expect(holders('South')).not.toContain(clearedLoser);
    expect(holders('South')).toContain(keptLoser);
    expect(inconsistencies()).toEqual([]);
  },
);
