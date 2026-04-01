import { validDateAvailability } from '@Validators/validateDateAvailability';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

import { COLLEGE_D3, USTA_BREWER_CUP, USTA_TOC } from '@Constants/tieFormatConstants';
import { DUPLICATE_VALUE, INVALID_VALUES, NOT_FOUND } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { DELETED_MATCHUP_IDS } from '@Constants/topicConstants';
import { TEAM } from '@Constants/eventConstants';

const scoringPolicy = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };

describe('removeCollectionDefinition branch coverage', () => {
  it('returns NOT_FOUND for nonexistent collectionId', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    let result: any = tournamentEngine.removeCollectionDefinition({
      collectionId: 'nonexistent-id',
      drawId,
    });
    expect(result.error).toEqual(NOT_FOUND);
  });

  it('removes collection from event-level tieFormat with eventId', () => {
    const deletedMatchUpIds: string[] = [];
    setSubscriptions({
      subscriptions: {
        [DELETED_MATCHUP_IDS]: (notices) => {
          notices.forEach(({ matchUpIds }) => deletedMatchUpIds.push(...matchUpIds));
        },
      },
    });

    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    const collectionId = event.tieFormat.collectionDefinitions[0].collectionId;

    let result: any = tournamentEngine.removeCollectionDefinition({
      eventId: event.eventId,
      collectionId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.tieFormat).toBeDefined();
    expect(result.deletedMatchUpIds.length).toBeGreaterThan(0);
    expect(deletedMatchUpIds.length).toBeGreaterThan(0);
  });

  it('removes collection from structure-level tieFormat', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event, drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;
    const collectionId = event.tieFormat.collectionDefinitions[0].collectionId;

    let result: any = tournamentEngine.removeCollectionDefinition({
      collectionId,
      structureId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.tieFormat).toBeDefined();
  });

  it('handles removal with tieFormatName when valueGoal changes', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    const collectionId = event.tieFormat.collectionDefinitions[0].collectionId;

    let result: any = tournamentEngine.removeCollectionDefinition({
      tieFormatName: 'Custom After Removal',
      collectionId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.tieFormat.tieFormatName).toEqual('Custom After Removal');
  });

  it('recalculates score when updateInProgressMatchUps is true on matchUp with scored collection', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
      policyDefinitions: scoringPolicy,
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    const collectionId = event.tieFormat.collectionDefinitions[0].collectionId;

    const matchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM] },
    }).matchUps;

    const nonTargetCollection = event.tieFormat.collectionDefinitions[1];
    const tieMatchUp = matchUps[0].tieMatchUps.find(
      (m) => m.collectionId === nonTargetCollection.collectionId,
    );

    let result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: tieMatchUp.matchUpId,
      outcome: {
        winningSide: 1,
        score: {
          sets: [
            { setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1 },
            { setNumber: 2, side1Score: 6, side2Score: 4, winningSide: 1 },
          ],
        },
      },
      drawId,
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.removeCollectionDefinition({
      matchUpId: matchUps[0].matchUpId,
      updateInProgressMatchUps: true,
      collectionId,
      drawId,
    });
    expect(result.success).toEqual(true);
  });
});

describe('modifyCollectionDefinition branch coverage', () => {
  it('modifies matchUpFormat on a collectionDefinition', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    const collectionId = event.tieFormat.collectionDefinitions[0].collectionId;

    let result: any = tournamentEngine.modifyCollectionDefinition({
      matchUpFormat: 'SET1-S:6/TB7',
      tieFormatName: 'Modified Format',
      collectionId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.tieFormat.tieFormatName).toEqual('Modified Format');
    expect(result.modifications.length).toBeGreaterThan(0);
  });

  it('modifies matchUpCount on a collectionDefinition', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    const collectionId = event.tieFormat.collectionDefinitions[0].collectionId;

    let result: any = tournamentEngine.modifyCollectionDefinition({
      matchUpCount: 5,
      collectionId,
      drawId,
    });
    expect(result.success).toEqual(true);
  });

  it('modifies collectionValue on a collectionDefinition', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    const collectionId = event.tieFormat.collectionDefinitions[0].collectionId;

    let result: any = tournamentEngine.modifyCollectionDefinition({
      collectionValue: 3,
      collectionId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.modifications.some((m) => m.collectionValue === 3)).toEqual(true);
  });

  it('modifies setValue on a grouped collection and removes collectionGroup', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: USTA_BREWER_CUP }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    const groupedDef = event.tieFormat.collectionDefinitions.find((def) => def.collectionGroupNumber);
    expect(groupedDef).toBeDefined();

    let result: any = tournamentEngine.modifyCollectionDefinition({
      collectionId: groupedDef.collectionId,
      setValue: 1,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.modifications.some((m) => m.change === 'collectionGroupNumber removed')).toEqual(true);
  });

  it('returns NOT_IMPLEMENTED for matchUpType change', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    const singlesCollection = event.tieFormat.collectionDefinitions.find(
      (cd) => cd.matchUpType === 'SINGLES',
    );

    let result: any = tournamentEngine.modifyCollectionDefinition({
      collectionId: singlesCollection.collectionId,
      matchUpType: 'DOUBLES',
      matchUpValue: 2,
      drawId,
    });
    expect(result.error).toBeDefined();
  });

  it('removes tieFormatName when modifications exist without new tieFormatName', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    const collectionId = event.tieFormat.collectionDefinitions[0].collectionId;

    let result: any = tournamentEngine.modifyCollectionDefinition({
      collectionName: 'Updated Singles',
      collectionId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.tieFormat.tieFormatName).toBeUndefined();
  });
});

describe('addCollectionDefinition branch coverage', () => {
  it('returns DUPLICATE_VALUE when collectionId already exists', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    const existingCollectionId = event.tieFormat.collectionDefinitions[0].collectionId;

    let result: any = tournamentEngine.addCollectionDefinition({
      collectionDefinition: {
        collectionId: existingCollectionId,
        collectionName: 'Duplicate',
        matchUpFormat: 'SET3-S:6/TB7',
        matchUpType: 'SINGLES',
        matchUpCount: 1,
        matchUpValue: 1,
      },
      drawId,
    });
    expect(result.error).toEqual(DUPLICATE_VALUE);
  });

  it('adds collection to event-level tieFormat via eventId', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });

    let result: any = tournamentEngine.addCollectionDefinition({
      collectionDefinition: {
        collectionName: 'Extra Singles',
        matchUpFormat: 'SET3-S:6/TB7',
        matchUpType: 'SINGLES',
        matchUpCount: 2,
        matchUpValue: 1,
      },
      eventId: event.eventId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.tieFormat).toBeDefined();
    expect(result.addedMatchUps.length).toBeGreaterThan(0);
  });

  it('adds collection to draw-level tieFormat', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    let result: any = tournamentEngine.addCollectionDefinition({
      collectionDefinition: {
        collectionName: 'Extra Doubles',
        matchUpFormat: 'SET3-S:6/TB7',
        matchUpType: 'DOUBLES',
        matchUpCount: 1,
        matchUpValue: 1,
      },
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.addedMatchUps.length).toBeGreaterThan(0);
  });

  it('adds collection to structure-level tieFormat', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;

    let result: any = tournamentEngine.addCollectionDefinition({
      collectionDefinition: {
        collectionName: 'Structure Singles',
        matchUpFormat: 'SET3-S:6/TB7',
        matchUpType: 'SINGLES',
        matchUpCount: 1,
        matchUpValue: 1,
      },
      structureId,
      drawId,
    });
    expect(result.success).toEqual(true);
  });

  it('adds collection to matchUp-level tieFormat', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
      policyDefinitions: scoringPolicy,
    });

    tournamentEngine.setState(tournamentRecord);

    const matchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM] },
    }).matchUps;
    const matchUpId = matchUps[0].matchUpId;

    let result: any = tournamentEngine.addCollectionDefinition({
      collectionDefinition: {
        collectionName: 'MatchUp Doubles',
        matchUpFormat: 'SET3-S:6/TB7',
        matchUpType: 'DOUBLES',
        matchUpCount: 1,
        matchUpValue: 1,
      },
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.addedMatchUps.length).toBeGreaterThan(0);
  });

  it('assigns collectionId when not provided in collectionDefinition', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    let result: any = tournamentEngine.addCollectionDefinition({
      collectionDefinition: {
        collectionName: 'No ID Collection',
        matchUpFormat: 'SET3-S:6/TB7',
        matchUpType: 'SINGLES',
        matchUpCount: 1,
        matchUpValue: 1,
      },
      drawId,
    });
    expect(result.success).toEqual(true);
    const addedCollection = result.tieFormat.collectionDefinitions.find(
      (cd) => cd.collectionName === 'No ID Collection',
    );
    expect(addedCollection.collectionId).toBeDefined();
  });

  it('handles tieFormatName when valueGoal changes', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    let result: any = tournamentEngine.addCollectionDefinition({
      collectionDefinition: {
        collectionName: 'Value Change Collection',
        matchUpFormat: 'SET3-S:6/TB7',
        matchUpType: 'SINGLES',
        matchUpCount: 3,
        matchUpValue: 5,
      },
      tieFormatName: 'New Format Name',
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.tieFormat.tieFormatName).toEqual('New Format Name');
  });
});

describe('validateDateAvailability branch coverage', () => {
  it('returns error for missing dateAvailability', () => {
    let result: any = validDateAvailability({});
    expect(result.error).toBeDefined();
  });

  it('returns error for non-array dateAvailability', () => {
    let result: any = validDateAvailability({ dateAvailability: 'string' });
    expect(result.error).toBeDefined();
  });

  it('returns error for non-object availability item', () => {
    let result: any = validDateAvailability({ dateAvailability: [42] });
    expect(result.error).toBeDefined();
  });

  it('returns error when startTime or endTime missing', () => {
    let result: any = validDateAvailability({ dateAvailability: [{ date: '2025-01-01' }] });
    expect(result.error).toBeDefined();
  });

  it('returns valid for correct dateAvailability with bookings', () => {
    let result: any = validDateAvailability({
      dateAvailability: [
        {
          date: '2025-01-01',
          startTime: '08:00',
          endTime: '18:00',
          bookings: [{ startTime: '09:00', endTime: '10:00' }],
        },
      ],
    });
    expect(result.valid).toEqual(true);
  });

  it('returns error for non-array bookings', () => {
    let result: any = validDateAvailability({
      dateAvailability: [
        {
          date: '2025-01-01',
          startTime: '08:00',
          endTime: '18:00',
          bookings: 'not-array',
        },
      ],
    });
    expect(result.error).toBeDefined();
  });

  it('returns error for non-object booking item', () => {
    let result: any = validDateAvailability({
      dateAvailability: [
        {
          date: '2025-01-01',
          startTime: '08:00',
          endTime: '18:00',
          bookings: ['not-object'],
        },
      ],
    });
    expect(result.error).toBeDefined();
  });

  it('returns error for booking with invalid startTime', () => {
    let result: any = validDateAvailability({
      dateAvailability: [
        {
          date: '2025-01-01',
          startTime: '08:00',
          endTime: '18:00',
          bookings: [{ startTime: 'bad', endTime: '10:00' }],
        },
      ],
    });
    expect(result.error).toBeDefined();
  });

  it('returns error for booking with invalid endTime', () => {
    let result: any = validDateAvailability({
      dateAvailability: [
        {
          date: '2025-01-01',
          startTime: '08:00',
          endTime: '18:00',
          bookings: [{ startTime: '09:00', endTime: 'bad' }],
        },
      ],
    });
    expect(result.error).toBeDefined();
  });

  it('returns error for booking where startTime equals endTime', () => {
    let result: any = validDateAvailability({
      dateAvailability: [
        {
          date: '2025-01-01',
          startTime: '08:00',
          endTime: '18:00',
          bookings: [{ startTime: '09:00', endTime: '09:00' }],
        },
      ],
    });
    expect(result.error).toBeDefined();
  });

  it('returns error for booking where endTime is before startTime', () => {
    let result: any = validDateAvailability({
      dateAvailability: [
        {
          date: '2025-01-01',
          startTime: '08:00',
          endTime: '18:00',
          bookings: [{ startTime: '10:00', endTime: '09:00' }],
        },
      ],
    });
    expect(result.error).toBeDefined();
  });

  it('returns valid for availability without date (date is optional)', () => {
    let result: any = validDateAvailability({
      dateAvailability: [
        {
          startTime: '08:00',
          endTime: '18:00',
        },
      ],
    });
    expect(result.valid).toEqual(true);
  });

  it('returns valid for availability with empty bookings array', () => {
    let result: any = validDateAvailability({
      dateAvailability: [
        {
          date: '2025-01-01',
          startTime: '08:00',
          endTime: '18:00',
          bookings: [],
        },
      ],
    });
    expect(result.valid).toEqual(true);
  });
});

describe('publishEvent embargo validation branch coverage', () => {
  it('returns INVALID_EMBARGO for invalid publishingDetail embargo', () => {
    const drawId = 'draw-emb-1';
    const eventId = 'event-emb-1';
    mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId, drawProfiles: [{ drawSize: 4, drawId }] }],
      setState: true,
    });

    let result: any = tournamentEngine.publishEvent({
      drawDetails: {
        [drawId]: {
          publishingDetail: { embargo: 'not-a-date' },
        },
      },
      eventId,
    });
    expect(result.error).toBeDefined();
  });

  it('returns INVALID_EMBARGO for invalid stageDetails embargo', () => {
    const drawId = 'draw-emb-2';
    const eventId = 'event-emb-2';
    mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId, drawProfiles: [{ drawSize: 4, drawId }] }],
      setState: true,
    });

    let result: any = tournamentEngine.publishEvent({
      drawDetails: {
        [drawId]: {
          publishingDetail: { published: true },
          stageDetails: {
            MAIN: { embargo: 'bad-date' },
          },
        },
      },
      eventId,
    });
    expect(result.error).toBeDefined();
  });

  it('returns INVALID_EMBARGO for invalid structureDetails embargo', () => {
    const drawId = 'draw-emb-3';
    const eventId = 'event-emb-3';
    mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId, drawProfiles: [{ drawSize: 4, drawId }] }],
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;

    let result: any = tournamentEngine.publishEvent({
      drawDetails: {
        [drawId]: {
          publishingDetail: { published: true },
          structureDetails: {
            [structureId]: { embargo: 'not-valid' },
          },
        },
      },
      eventId,
    });
    expect(result.error).toBeDefined();
  });

  it('returns INVALID_EMBARGO for invalid scheduledRounds embargo', () => {
    const drawId = 'draw-emb-4';
    const eventId = 'event-emb-4';
    mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId, drawProfiles: [{ drawSize: 4, drawId }] }],
      setState: true,
    });

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;

    let result: any = tournamentEngine.publishEvent({
      drawDetails: {
        [drawId]: {
          publishingDetail: { published: true },
          structureDetails: {
            [structureId]: {
              scheduledRounds: {
                1: { embargo: 'invalid-embargo-date' },
              },
            },
          },
        },
      },
      eventId,
    });
    expect(result.error).toBeDefined();
  });

  it('succeeds with valid embargo dates at all levels', () => {
    const drawId = 'draw-emb-5';
    const eventId = 'event-emb-5';
    mocksEngine.generateTournamentRecord({
      eventProfiles: [{ eventId, drawProfiles: [{ drawSize: 4, drawId }] }],
      setState: true,
    });

    const futureDate = '2099-12-31T23:59:00Z';

    let result: any = tournamentEngine.publishEvent({
      drawDetails: {
        [drawId]: {
          publishingDetail: {
            published: true,
            embargo: futureDate,
          },
        },
      },
      eventId,
    });
    expect(result.success).toEqual(true);
  });
});
