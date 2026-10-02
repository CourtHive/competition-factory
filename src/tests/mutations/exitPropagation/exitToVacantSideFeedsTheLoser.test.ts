import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * **An exit awarded to the vacant side feeds its lone occupant on, whichever side that occupant is on.**
 *
 * Census seed 9000522 (COMPASS 16/11), shrunk to ONE step: `East|2|3` holds a lone occupant on side 2,
 * advanced there by a first-round BYE, while side 1 waits on an unplayed `East|1|5`. A WALKOVER awarded to
 * side 1 must send the occupant, its loser, to North. It did not: the draw reported DROPPED_PROGRESSION.
 *
 * `processDrawPositionDirecting` read the loser's position as `drawPositions[1 - (winningSide - 1)]`. With
 * one position present the array is compacted, so index 0 is the occupant whatever side they are on — the
 * occupant was read as the WINNER's position and the loser's came back `undefined`. With the occupant on
 * side 1 the same index happened to be right, which is why only half of these cells ever failed.
 * `removeDirectedParticipants` read it the same way, so clearing the exit is asserted too.
 *
 * Every second-round East matchUp with ONE occupant is played, at both exit statuses — the cells where
 * the occupant sits on side 1 pass on the unfixed tree and are here as the control.
 */
const drawId = 'vacant-winner';
const generate = () => {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: COMPASS, drawSize: 16, participantsCount: 11, drawId }],
    nonRandom: 9000522,
    setState: true,
  });
};

const getMatchUps = () => tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps;
const north = () => {
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const structure = drawDefinition.structures.find((s: any) => s.structureName === 'North');
  return structure.positionAssignments.map((a: any) => a.participantId).filter(Boolean);
};
const inconsistencies = () => {
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  return getDrawInconsistencies({ drawDefinition }).inconsistencies?.map((i: any) => i.issueType) ?? [];
};

generate();
const CELLS = getMatchUps()
  .filter((m: any) => m.structureName === 'East' && m.roundNumber === 2)
  .filter((m: any) => m.sides.filter((side: any) => side.participantId).length === 1)
  .flatMap((m: any) => {
    const occupiedSide = m.sides.find((side: any) => side.participantId).sideNumber;
    return [WALKOVER, DEFAULTED].map((matchUpStatus) => ({
      roundPosition: m.roundPosition,
      occupiedSide,
      matchUpStatus,
    }));
  });

it('the census draw holds lone occupants on BOTH sides of the second round', () => {
  const sides = new Set(CELLS.map((cell) => cell.occupiedSide));
  expect([...sides].sort((a, b) => a - b)).toEqual([1, 2]);
});

it.each(CELLS)(
  'East|2|$roundPosition, occupant on side $occupiedSide: $matchUpStatus to the vacant side feeds them to North',
  ({ roundPosition, occupiedSide, matchUpStatus }) => {
    generate();
    const target = getMatchUps().find(
      (m: any) => m.structureName === 'East' && m.roundNumber === 2 && m.roundPosition === roundPosition,
    );
    const occupantId = target.sides.find((side: any) => side.sideNumber === occupiedSide).participantId;

    let result: any = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus, winningSide: 3 - occupiedSide },
      matchUpId: target.matchUpId,
      propagateExitStatus: true,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(north()).toContain(occupantId);
    expect(inconsistencies()).toEqual([]);

    result = tournamentEngine.setMatchUpStatus({
      outcome: { matchUpStatus: TO_BE_PLAYED, score: { scoreStringSide1: '', scoreStringSide2: '' } },
      matchUpId: target.matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(north()).not.toContain(occupantId);
    expect(inconsistencies()).toEqual([]);
  },
);
