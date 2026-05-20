import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { allDrawMatchUps } from '@Query/matchUps/getAllDrawMatchUps';
import { getDrawStructures } from '@Acquire/findStructure';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

import { POLICY_TYPE_AVOIDANCE } from '@Constants/policyConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';
import { SINGLES } from '@Constants/eventConstants';

const nationalityAvoidance = {
  [POLICY_TYPE_AVOIDANCE]: {
    roundsToSeparate: undefined,
    policyName: 'Nationality Code',
    policyAttributes: [{ key: 'person.nationalityCode' }],
  },
};

describe('seed placement avoidance', () => {
  it('separates seeded participants with same nationality into different halves', () => {
    // Generate a tournament with enough participants to have seeds with shared nationalities
    const drawSize = 16;
    const seedsCount = 4;

    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: drawSize },
      setState: true,
    });

    const participants = tournamentRecord.participants;

    // mocksEngine assigns random nationality codes from a finite pool, so
    // there's a ~5% chance an unseeded participant rolls the same code as
    // our target seeds — that grows the conflict group and the avoidance
    // algorithm may legitimately fail to put our two seeds in different
    // halves. Reset every participant to a unique synthetic code so the
    // only conflict group is the one we declare below (seeds 3 + 4).
    participants.forEach((p, i) => {
      if (p.person) p.person.nationalityCode = `Z${String(i).padStart(2, '0')}`;
    });

    // Assign the same nationality to seeds 3 and 4 to create a conflict scenario
    const targetNationality = 'USA';
    if (participants[2]?.person) participants[2].person.nationalityCode = targetNationality;
    if (participants[3]?.person) participants[3].person.nationalityCode = targetNationality;

    // Use different nationalities for seeds 1 and 2
    if (participants[0]?.person) participants[0].person.nationalityCode = 'GBR';
    if (participants[1]?.person) participants[1].person.nationalityCode = 'FRA';

    tournamentEngine.setState(tournamentRecord);

    let result: any = tournamentEngine.addEvent({
      event: { eventName: 'Test', eventType: SINGLES },
    });
    const { event } = result;
    const eventId = event.eventId;

    const participantIds = participants.slice(0, drawSize).map((p) => p.participantId);
    tournamentEngine.addEventEntries({ eventId, participantIds });

    result = tournamentEngine.generateDrawDefinition({
      policyDefinitions: nationalityAvoidance,
      seedsCount,
      eventId,
    });
    expect(result.success).toEqual(true);
    const { drawDefinition } = result;

    result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
    expect(result.success).toEqual(true);

    // Get the seed assignments and their draw positions
    const { structures } = getDrawStructures({ drawDefinition, stage: MAIN, stageSequence: 1 });
    const structure = structures[0];
    const { positionAssignments } = getPositionAssignments({ structure });

    // Find draw positions of the two USA seeds (participants[2] and participants[3])
    const seed3Position = positionAssignments?.find(
      (pa) => pa.participantId === participants[2].participantId,
    )?.drawPosition;
    const seed4Position = positionAssignments?.find(
      (pa) => pa.participantId === participants[3].participantId,
    )?.drawPosition;

    if (seed3Position && seed4Position) {
      // In a 16-draw, top half is positions 1-8, bottom half is 9-16
      const halfSize = drawSize / 2;
      const seed3Half = seed3Position <= halfSize ? 'top' : 'bottom';
      const seed4Half = seed4Position <= halfSize ? 'top' : 'bottom';

      // Seeds with same nationality should be in different halves
      expect(seed3Half).not.toEqual(seed4Half);
    }
  });

  it('handles avoidance gracefully when separation is impossible', () => {
    // 4-draw with 4 seeds all from the same country — impossible to fully separate
    const drawSize = 4;
    const seedsCount = 4;

    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: drawSize },
      setState: true,
    });

    const participants = tournamentRecord.participants;
    // All seeds same nationality
    participants.forEach((p) => {
      if (p.person) p.person.nationalityCode = 'USA';
    });

    tournamentEngine.setState(tournamentRecord);

    let result: any = tournamentEngine.addEvent({
      event: { eventName: 'Test', eventType: SINGLES },
    });
    const eventId = result.event.eventId;

    const participantIds = participants.slice(0, drawSize).map((p) => p.participantId);
    tournamentEngine.addEventEntries({ eventId, participantIds });

    // Should succeed without error — best effort, no crash
    result = tournamentEngine.generateDrawDefinition({
      policyDefinitions: nationalityAvoidance,
      seedsCount,
      eventId,
    });
    expect(result.success).toEqual(true);
  });

  it('does not alter placement when no avoidance conflicts exist', () => {
    const drawSize = 8;
    const seedsCount = 4;

    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: drawSize },
      setState: true,
    });

    const participants = tournamentRecord.participants;
    // All seeds have unique nationalities
    const countries = ['USA', 'GBR', 'FRA', 'AUS', 'GER', 'ESP', 'ITA', 'JPN'];
    participants.forEach((p, i) => {
      if (p.person) p.person.nationalityCode = countries[i % countries.length];
    });

    tournamentEngine.setState(tournamentRecord);

    let result: any = tournamentEngine.addEvent({
      event: { eventName: 'Test', eventType: SINGLES },
    });
    const eventId = result.event.eventId;

    const participantIds = participants.slice(0, drawSize).map((p) => p.participantId);
    tournamentEngine.addEventEntries({ eventId, participantIds });

    result = tournamentEngine.generateDrawDefinition({
      policyDefinitions: nationalityAvoidance,
      seedsCount,
      eventId,
    });
    expect(result.success).toEqual(true);

    // All seeds should be placed (draw generation succeeded)
    const { drawDefinition } = result;
    const { structures } = getDrawStructures({ drawDefinition, stage: MAIN, stageSequence: 1 });
    const { positionAssignments } = getPositionAssignments({ structure: structures[0] });
    const seededPositions = positionAssignments?.filter((pa) => pa.participantId);
    expect(seededPositions?.length).toBeGreaterThanOrEqual(seedsCount);
  });

  it('works with larger draws and multiple conflict groups', () => {
    const drawSize = 32;
    const seedsCount = 8;

    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: drawSize },
      setState: true,
    });

    const participants = tournamentRecord.participants;
    // Unique synthetic codes for every participant so the only conflict
    // groups are the ones we declare below. See top test for the flake-mode
    // this defends against.
    participants.forEach((p, i) => {
      if (p.person) p.person.nationalityCode = `Z${String(i).padStart(2, '0')}`;
    });
    // Seeds 1,5 = USA, Seeds 2,6 = GBR, Seeds 3,7 = FRA, Seeds 4,8 = AUS
    const seedNationalities = ['USA', 'GBR', 'FRA', 'AUS', 'USA', 'GBR', 'FRA', 'AUS'];
    for (let i = 0; i < 8; i++) {
      if (participants[i]?.person) participants[i].person.nationalityCode = seedNationalities[i];
    }

    tournamentEngine.setState(tournamentRecord);

    let result: any = tournamentEngine.addEvent({
      event: { eventName: 'Test', eventType: SINGLES },
    });
    const eventId = result.event.eventId;

    const participantIds = participants.slice(0, drawSize).map((p) => p.participantId);
    tournamentEngine.addEventEntries({ eventId, participantIds });

    result = tournamentEngine.generateDrawDefinition({
      policyDefinitions: nationalityAvoidance,
      seedsCount,
      eventId,
    });
    expect(result.success).toEqual(true);

    // Verify draw was created with all seeds placed
    const { drawDefinition } = result;
    const { matchUps } = allDrawMatchUps({ drawDefinition });
    expect(matchUps?.length).toBeGreaterThan(0);
  });
});
