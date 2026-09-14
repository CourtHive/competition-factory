import tournamentEngine from '@Engines/syncEngine';
import scaleEngine from '@Engines/scaleEngine';
import { describe, expect, it } from 'vitest';
import { mocksEngine } from '../../..';

// constants
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_RANKING_POINTS } from '@Constants/policyConstants';
import { SINGLES } from '@Constants/eventConstants';
import { RANKING } from '@Constants/scaleConstants';

const simplePolicy = {
  [POLICY_TYPE_RANKING_POINTS]: {
    awardProfiles: [
      {
        profileName: 'Standard SE',
        drawTypes: [SINGLE_ELIMINATION],
        finishingPositionRanges: {
          1: { level: { 1: 1000, 2: 500, 3: 300 } },
          2: { level: { 1: 700, 2: 350, 3: 210 } },
          4: { level: { 1: 400, 2: 200, 3: 120 } },
          8: { level: { 1: 200, 2: 100, 3: 60 } },
        },
      },
    ],
  },
};

describe('applyTournamentRankingPoints', () => {
  it('writes scaleItems for each participant with points', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }],
      completeAllMatchUps: true,
      setState: true,
    });

    const result = scaleEngine.applyTournamentRankingPoints({
      policyDefinitions: simplePolicy,
      level: 1,
      scaleName: 'TEST_POINTS',
    });

    expect(result.success).toEqual(true);
    expect(result.modificationsApplied).toBeGreaterThan(0);
    expect(Object.keys(result.personPoints).length).toBeGreaterThan(0);
  });

  it('persists retrievable scaleItems via getParticipantScaleItem', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }],
      completeAllMatchUps: true,
      setState: true,
    });

    const applyResult = scaleEngine.applyTournamentRankingPoints({
      policyDefinitions: simplePolicy,
      level: 1,
      scaleName: 'TEST_POINTS',
    });

    expect(applyResult.success).toEqual(true);

    // Pick a person with points and retrieve their scaleItem
    const personIds = Object.keys(applyResult.personPoints);
    expect(personIds.length).toBeGreaterThan(0);

    // Find the participantId for the first personId
    const { participants } = tournamentEngine.getParticipants();
    const personIdToParticipantId: Record<string, string> = {};
    for (const p of participants) {
      if (p.person?.personId) {
        personIdToParticipantId[p.person.personId] = p.participantId;
      }
    }

    const testPersonId = personIds[0];
    const testParticipantId = personIdToParticipantId[testPersonId];
    expect(testParticipantId).toBeDefined();

    const { scaleItem } = tournamentEngine.getParticipantScaleItem({
      participantId: testParticipantId,
      scaleAttributes: {
        scaleType: RANKING,
        scaleName: 'TEST_POINTS',
        eventType: SINGLES,
      },
    });

    expect(scaleItem).toBeDefined();
    expect(scaleItem.scaleValue).toBeDefined();
    expect(scaleItem.scaleValue.points).toBeGreaterThan(0);
    expect(Array.isArray(scaleItem.scaleValue.awards)).toEqual(true);
    expect(scaleItem.scaleValue.awards.length).toBeGreaterThan(0);
  });

  it('stores correct total points in scaleValue', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }],
      completeAllMatchUps: true,
      setState: true,
    });

    const applyResult = scaleEngine.applyTournamentRankingPoints({
      policyDefinitions: simplePolicy,
      level: 1,
      scaleName: 'VERIFY_POINTS',
    });

    expect(applyResult.success).toEqual(true);

    // Verify that stored points match the computed personPoints
    const { participants } = tournamentEngine.getParticipants();
    const personIdToParticipantId: Record<string, string> = {};
    for (const p of participants) {
      if (p.person?.personId) {
        personIdToParticipantId[p.person.personId] = p.participantId;
      }
    }

    for (const [personId, awards] of Object.entries(applyResult.personPoints as Record<string, any[]>)) {
      const participantId = personIdToParticipantId[personId];
      if (!participantId) continue;

      const expectedTotal = awards.reduce(
        (sum, a) => sum + (a.points || 0) + (a.qualityWinPoints || 0) + (a.linePoints || 0),
        0,
      );

      const { scaleItem } = tournamentEngine.getParticipantScaleItem({
        participantId,
        scaleAttributes: {
          scaleType: RANKING,
          scaleName: 'VERIFY_POINTS',
          eventType: SINGLES,
        },
      });

      expect(scaleItem?.scaleValue?.points).toEqual(expectedTotal);
    }
  });

  it('supports removePriorValues to overwrite existing scaleItems', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 4 }],
      completeAllMatchUps: true,
      setState: true,
    });

    // First apply
    const result1 = scaleEngine.applyTournamentRankingPoints({
      policyDefinitions: simplePolicy,
      level: 2,
      scaleName: 'OVERWRITE_TEST',
    });
    expect(result1.success).toEqual(true);

    // Second apply with removePriorValues
    const result2 = scaleEngine.applyTournamentRankingPoints({
      policyDefinitions: simplePolicy,
      level: 2,
      scaleName: 'OVERWRITE_TEST',
      removePriorValues: true,
    });
    expect(result2.success).toEqual(true);
    expect(result2.modificationsApplied).toBeGreaterThan(0);

    // The scaleItem should reflect the second apply's values (same in this case)
    const { participants } = tournamentEngine.getParticipants();
    const firstParticipant = participants.find((p) => p.person?.personId);
    if (firstParticipant) {
      const { scaleItem } = tournamentEngine.getParticipantScaleItem({
        participantId: firstParticipant.participantId,
        scaleAttributes: {
          scaleType: RANKING,
          scaleName: 'OVERWRITE_TEST',
          eventType: SINGLES,
        },
      });
      // Should still have valid data (not doubled or corrupted)
      if (scaleItem?.scaleValue) {
        expect(scaleItem.scaleValue.points).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('champion gets highest point value at L1', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8 }],
      completeAllMatchUps: true,
      setState: true,
    });

    const result = scaleEngine.applyTournamentRankingPoints({
      policyDefinitions: simplePolicy,
      level: 1,
      scaleName: 'CHAMPION_TEST',
    });

    expect(result.success).toEqual(true);

    // Find the champion (highest points)
    let maxPoints = 0;
    let championPersonId = '';
    for (const [personId, awards] of Object.entries(result.personPoints as Record<string, any[]>)) {
      const total = awards.reduce((sum, a) => sum + (a.points || 0), 0);
      if (total > maxPoints) {
        maxPoints = total;
        championPersonId = personId;
      }
    }

    // Champion at L1 in 8-draw SE should get 1000 position points
    expect(maxPoints).toEqual(1000);
    expect(championPersonId).toBeTruthy();

    // Verify it's persisted
    const { participants } = tournamentEngine.getParticipants();
    const champion = participants.find((p) => p.person?.personId === championPersonId);
    expect(champion).toBeDefined();

    const { scaleItem } = tournamentEngine.getParticipantScaleItem({
      participantId: champion!.participantId,
      scaleAttributes: {
        scaleType: RANKING,
        scaleName: 'CHAMPION_TEST',
        eventType: SINGLES,
      },
    });

    expect(scaleItem?.scaleValue?.points).toEqual(1000);
  });

  it('uses default scaleName when not specified', () => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 4 }],
      completeAllMatchUps: true,
      setState: true,
    });

    const result = scaleEngine.applyTournamentRankingPoints({
      policyDefinitions: simplePolicy,
      level: 3,
    });

    expect(result.success).toEqual(true);

    // Retrieve with default scaleName 'RANKING_POINTS'
    const { participants } = tournamentEngine.getParticipants();
    const withPerson = participants.find((p) => p.person?.personId);
    if (withPerson) {
      const { scaleItem } = tournamentEngine.getParticipantScaleItem({
        participantId: withPerson.participantId,
        scaleAttributes: {
          scaleType: RANKING,
          scaleName: 'RANKING_POINTS',
          eventType: SINGLES,
        },
      });
      expect(scaleItem).toBeDefined();
    }
  });
});
