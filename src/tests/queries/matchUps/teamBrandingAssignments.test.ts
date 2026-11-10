import { getCollectionAssignment } from '@Query/matchUps/getCollectionAssignment';
import { describe, expect, it } from 'vitest';

const team: any = {
  participantId: 'team',
  participantType: 'TEAM',
  participantName: 'Team',
  teamColors: { primary: '#AABBCC' },
  notes: 'private',
};

describe('TEAM branding on unassigned lines', () => {
  it.each(['SINGLES', 'DOUBLES'])(
    'keeps privacy-filtered identity on ad hoc %s sides without assigned players',
    (matchUpType) => {
      for (const participantTemplate of [undefined, { participantId: true, participantName: true }]) {
        const result = getCollectionAssignment({
          collectionPosition: 1,
          collectionId: 'collection',
          matchUpType,
          positionAssignments: [],
          sideLineUps: [{ sideNumber: 1, teamParticipant: team }],
          participantTemplate,
        });
        const hydrated = result.sideNumberCollectionAssignment?.[1]?.teamParticipant;
        expect(hydrated?.participantId).toBe('team');
        expect(hydrated?.teamColors).toEqual(participantTemplate ? undefined : team.teamColors);
        if (participantTemplate) expect(hydrated).not.toHaveProperty('notes');
      }
    },
  );
  it.each(['side', 'map', 'raw'])('filters the %s draw-backed resolution path without losing the team', (route) => {
    const result = getCollectionAssignment({
      collectionPosition: 1,
      collectionId: 'collection',
      matchUpType: 'SINGLES',
      drawPositions: [1],
      positionAssignments: [{ drawPosition: 1, participantId: 'team' }],
      participantTemplate: { participantId: true, participantName: true },
      ...(route === 'side' && { sideLineUps: [{ drawPosition: 1, teamParticipant: team }] }),
      ...(route === 'map' && { participantMap: { team: { participant: team } } as any }),
      ...(route === 'raw' && { tournamentParticipants: [team] }),
    });
    expect(result.drawPositionCollectionAssignment?.[1]?.teamParticipant).toEqual({
      participantId: 'team',
      participantName: 'Team',
    });
  });
});

it('does not invent a TEAM assignment when neither a player nor TEAM identity is available', () => {
  const result = getCollectionAssignment({
    collectionPosition: 1,
    collectionId: 'collection',
    matchUpType: 'SINGLES',
    positionAssignments: [],
    sideLineUps: [{ sideNumber: 1 }],
  });
  expect(result.sideNumberCollectionAssignment).toEqual({});
});
