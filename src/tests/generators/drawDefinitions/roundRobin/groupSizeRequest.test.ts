import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

// constants
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';

const DRAW_SIZE = 12;

function generateRoundRobinGroups(structureOptions?: any) {
  mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: DRAW_SIZE }, setState: true });
  const participantIds = tournamentEngine.getParticipants().participants.map(({ participantId }) => participantId);
  tournamentEngine.addEvent({ event: { eventName: 'Round robin event', eventId: 'eventId' } });
  tournamentEngine.addEventEntries({ eventId: 'eventId', participantIds });

  const result: any = tournamentEngine.generateDrawDefinition({
    drawType: ROUND_ROBIN,
    drawSize: DRAW_SIZE,
    eventId: 'eventId',
    structureOptions,
    automated: true,
  });

  const groups = result.drawDefinition?.structures?.[0]?.structures ?? [];
  return {
    error: result.error,
    groupCount: groups.length,
    groupSizes: groups.map((g) => g.positionAssignments.length),
  };
}

describe('ROUND_ROBIN structureOptions.groupSize', () => {
  // regression: groupSizeLimit defaulted to 8 and an unhonorable groupSize was silently replaced,
  // so a league division asking for ONE full round robin of 12 got two groups of 6 with no error
  it('honors a requested groupSize larger than the default groupSizeLimit', () => {
    const { error, groupCount, groupSizes } = generateRoundRobinGroups({ groupSize: DRAW_SIZE });
    expect(error).toBeUndefined();
    expect(groupCount).toEqual(1);
    expect(groupSizes).toEqual([DRAW_SIZE]);
  });

  it('honors a requested groupSize within the default groupSizeLimit', () => {
    const { error, groupCount, groupSizes } = generateRoundRobinGroups({ groupSize: 6 });
    expect(error).toBeUndefined();
    expect(groupCount).toEqual(2);
    expect(groupSizes).toEqual([6, 6]);
  });

  // an explicitly supplied groupSizeLimit is still authoritative — only the DEFAULT gives way
  it('respects an explicit groupSizeLimit that excludes the requested groupSize', () => {
    const { error, groupCount } = generateRoundRobinGroups({ groupSize: DRAW_SIZE, groupSizeLimit: 8 });
    expect(error).toBeUndefined();
    expect(groupCount).toBeGreaterThan(1);
  });

  it('defaults to groups of four when no groupSize is requested', () => {
    const { error, groupCount, groupSizes } = generateRoundRobinGroups();
    expect(error).toBeUndefined();
    expect(groupCount).toEqual(3);
    expect(groupSizes).toEqual([4, 4, 4]);
  });
});
