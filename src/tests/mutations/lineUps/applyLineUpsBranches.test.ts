import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import {
  INVALID_PARTICIPANT_TYPE,
  MISSING_DRAW_POSITIONS,
  PARTICIPANT_NOT_FOUND,
  INVALID_VALUES,
} from '@Constants/errorConditionConstants';

/**
 * `applyLineUps` refuses a malformed lineUp before writing anything, and places a well-formed one on
 * the side its players belong to. Each refusal below is one shape of malformed input; the last tests
 * cover a dual stored with no `sides` array, a lineUp whose players are mostly side 2's, and a dual
 * nobody has reached yet.
 */

function setup() {
  const drawId = 'lineUps';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId, drawSize: 4, eventType: TEAM_EVENT, tieFormatName: DOMINANT_DUO }],
    setState: true,
  });
  const matchUps: any[] = tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [];
  const duals = matchUps.filter((matchUp) => matchUp.tieMatchUps);
  const firstRound = duals.find((dual) => dual.roundNumber === 1);
  const final = duals.find((dual) => dual.roundNumber === 2);
  const [side1, side2] = firstRound.sides;
  const collectionIds = [...new Set(firstRound.tieMatchUps.map((tieMatchUp: any) => tieMatchUp.collectionId))];
  // CONTROL: a populated first-round dual, an unreached final, and collections to assign into
  expect(side1.participant.individualParticipantIds.length).toBeGreaterThan(1);
  expect(final.drawPositions?.filter(Boolean) ?? []).toEqual([]);
  expect(collectionIds.length).toBeGreaterThan(0);
  return { drawId, firstRound, final, side1, side2, collectionIds };
}

const apply = (drawId: string, matchUpId: string, lineUps: any[]): any =>
  tournamentEngine.applyLineUps({ drawId, matchUpId, lineUps });

describe('applyLineUps — malformed lineUps are refused', () => {
  it('refuses an assignment that is not an object', () => {
    const { drawId, firstRound } = setup();
    expect(apply(drawId, firstRound.matchUpId, [['not an assignment']]).error).toEqual(INVALID_VALUES);
  });

  it('refuses collectionAssignments that are not an array', () => {
    const { drawId, firstRound, side1 } = setup();
    const [participantId] = side1.participant.individualParticipantIds;
    const result = apply(drawId, firstRound.matchUpId, [[{ participantId, collectionAssignments: 'x' }]]);
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('refuses a participant who does not exist', () => {
    const { drawId, firstRound } = setup();
    const result = apply(drawId, firstRound.matchUpId, [[{ participantId: 'nobody', collectionAssignments: [] }]]);
    expect(result.error).toEqual(PARTICIPANT_NOT_FOUND);
  });

  it('refuses a participant who is not an individual', () => {
    const { drawId, firstRound, side1 } = setup();
    const result = apply(drawId, firstRound.matchUpId, [
      [{ participantId: side1.participant.participantId, collectionAssignments: [] }],
    ]);
    expect(result.error).toEqual(INVALID_PARTICIPANT_TYPE);
  });

  it('refuses a collection assignment that is not an object, and one naming no collection of the tieFormat', () => {
    const { drawId, firstRound, side1 } = setup();
    const [participantId] = side1.participant.individualParticipantIds;
    let result: any = apply(drawId, firstRound.matchUpId, [[{ participantId, collectionAssignments: ['x'] }]]);
    expect(result.error).toEqual(INVALID_VALUES);

    result = apply(drawId, firstRound.matchUpId, [
      [{ participantId, collectionAssignments: [{ collectionId: 'unknown', collectionPosition: 1 }] }],
    ]);
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.collectionId).toEqual('unknown');
  });

  it('refuses two players on one singles position', () => {
    const { drawId, firstRound, side1 } = setup();
    const singles = firstRound.tieMatchUps.find((tieMatchUp: any) => tieMatchUp.matchUpType === 'SINGLES');
    const assignment = { collectionId: singles.collectionId, collectionPosition: singles.collectionPosition };
    const [first, second] = side1.participant.individualParticipantIds;
    const result = apply(drawId, firstRound.matchUpId, [
      [
        { participantId: first, collectionAssignments: [assignment] },
        { participantId: second, collectionAssignments: [assignment] },
      ],
    ]);
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.info).toMatch(/Excessive/);
  });

  it('refuses a dual nobody has reached', () => {
    const { drawId, final, side1 } = setup();
    const [participantId] = side1.participant.individualParticipantIds;
    const result = apply(drawId, final.matchUpId, [[{ participantId, collectionAssignments: [] }]]);
    expect(result.error).toEqual(MISSING_DRAW_POSITIONS);
  });
});

describe('applyLineUps — a well-formed lineUp lands on its players’ side', () => {
  it('places a lineUp made of side 2’s players on side 2', () => {
    const { drawId, firstRound, side2 } = setup();
    const lineUp = side2.participant.individualParticipantIds.map((participantId: string) => ({
      collectionAssignments: [],
      participantId,
    }));
    expect(apply(drawId, firstRound.matchUpId, [lineUp]).success).toEqual(true);

    const { matchUp } = tournamentEngine.findMatchUp({ drawId, matchUpId: firstRound.matchUpId });
    const placed = matchUp.sides.find((side: any) => side.sideNumber === 2);
    expect(placed.lineUp.map((member: any) => member.participantId)).toEqual(
      side2.participant.individualParticipantIds,
    );
  });

  it('creates the side on a dual stored with no sides', () => {
    const { drawId, firstRound, side1 } = setup();
    const { tournamentRecord } = tournamentEngine.getTournament();
    const stored = tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps.find(
      (matchUp: any) => matchUp.matchUpId === firstRound.matchUpId,
    );
    delete stored.sides;
    tournamentEngine.setState(tournamentRecord);

    const lineUp = side1.participant.individualParticipantIds.map((participantId: string) => ({
      collectionAssignments: [],
      participantId,
    }));
    expect(apply(drawId, firstRound.matchUpId, [lineUp]).success).toEqual(true);

    const after = tournamentEngine
      .getTournament()
      .tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps.find(
        (matchUp: any) => matchUp.matchUpId === firstRound.matchUpId,
      );
    expect(after.sides.find((side: any) => side.sideNumber === 1)?.lineUp).toHaveLength(lineUp.length);
  });
});
