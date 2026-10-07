import { generateSeedingScaleItems } from '@Assemblies/generators/drawDefinitions/generateSeedingScaleItems';
import POLICY_SEEDING_DEFAULT from '@Fixtures/policies/POLICY_SEEDING_DEFAULT';
import { MISSING_VALUE } from '@Constants/errorConditionConstants';
import { SEEDING, RATING } from '@Constants/scaleConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';
import { ScaleAttributes } from '@Types/factoryTypes';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, describe } from 'vitest';

describe('generateSeedingScaleItems', () => {
  const baseScaleAttributes: ScaleAttributes = {
    eventType: SINGLES_EVENT,
    scaleType: RATING,
    scaleName: 'WTN',
  };

  it('should return error when scaleAttributes is missing', () => {
    const result = generateSeedingScaleItems({
      scaleAttributes: undefined,
      scaledEntries: [],
      stageEntries: [],
      seedsCount: 8,
      scaleName: 'U18',
    });

    expect(result.error).toEqual(MISSING_VALUE);
    expect(result.info).toEqual('missing scaleAttributes');
    expect(result.scaleItemsWithParticipantIds).toBeUndefined();
  });

  it('should generate scale items for seeded participants', () => {
    const scaledEntries = [
      { participantId: 'p1', scaledValue: 10 },
      { participantId: 'p2', scaledValue: 9.5 },
      { participantId: 'p3', scaledValue: 9 },
      { participantId: 'p4', scaledValue: 8.5 },
    ];

    const stageEntries = [
      { participantId: 'p1' },
      { participantId: 'p2' },
      { participantId: 'p3' },
      { participantId: 'p4' },
      { participantId: 'p5' },
    ];

    const result = generateSeedingScaleItems({
      scaleAttributes: baseScaleAttributes,
      scaleName: 'U18',
      scaledEntries,
      stageEntries,
      seedsCount: 4,
    });

    expect(result.error).toBeUndefined();
    expect(result.scaleItemsWithParticipantIds).toBeDefined();
    expect(result.scaleItemsWithParticipantIds?.length).toEqual(5);

    // Check that first 4 participants have seed values (1-4)
    const p1Item = result.scaleItemsWithParticipantIds?.find((item) => item.participantId === 'p1');
    expect(p1Item?.scaleItems[0].scaleValue).toEqual(1);

    const p2Item = result.scaleItemsWithParticipantIds?.find((item) => item.participantId === 'p2');
    expect(p2Item?.scaleItems[0].scaleValue).toEqual(2);

    const p3Item = result.scaleItemsWithParticipantIds?.find((item) => item.participantId === 'p3');
    expect(p3Item?.scaleItems[0].scaleValue).toEqual(3);

    const p4Item = result.scaleItemsWithParticipantIds?.find((item) => item.participantId === 'p4');
    expect(p4Item?.scaleItems[0].scaleValue).toEqual(4);

    // Check that 5th participant has undefined seed value
    const p5Item = result.scaleItemsWithParticipantIds?.find((item) => item.participantId === 'p5');
    expect(p5Item?.scaleItems[0].scaleValue).toBeUndefined();
  });

  it('should use scaleName from scaleAttributes when not provided', () => {
    const scaleAttributes: ScaleAttributes = {
      eventType: SINGLES_EVENT,
      scaleType: RATING,
      scaleName: 'WTN',
    };

    const scaledEntries = [{ participantId: 'p1', scaledValue: 10 }];
    const stageEntries = [{ participantId: 'p1' }];

    const result = generateSeedingScaleItems({
      scaleAttributes,
      scaledEntries,
      stageEntries,
      seedsCount: 1,
      scaleName: undefined,
    });

    expect(result?.scaleItemsWithParticipantIds?.[0].scaleItems[0].scaleName).toEqual('WTN');
  });

  it('should prefer provided scaleName over scaleAttributes.scaleName', () => {
    const scaleAttributes: ScaleAttributes = {
      eventType: SINGLES_EVENT,
      scaleType: RATING,
      scaleName: 'WTN',
    };

    const scaledEntries = [{ participantId: 'p1', scaledValue: 10 }];
    const stageEntries = [{ participantId: 'p1' }];

    const result = generateSeedingScaleItems({
      scaleAttributes,
      scaledEntries,
      stageEntries,
      seedsCount: 1,
      scaleName: 'U18',
    });

    expect(result?.scaleItemsWithParticipantIds?.[0].scaleItems[0].scaleName).toEqual('U18');
  });

  it('should handle empty scaledEntries', () => {
    const stageEntries = [{ participantId: 'p1' }, { participantId: 'p2' }];

    const result = generateSeedingScaleItems({
      scaleAttributes: baseScaleAttributes,
      scaledEntries: [],
      stageEntries,
      seedsCount: 8,
      scaleName: 'U18',
    });

    expect(result.error).toBeUndefined();
    expect(result?.scaleItemsWithParticipantIds?.length).toEqual(2);

    // All participants should have undefined scaleValue
    result?.scaleItemsWithParticipantIds?.forEach((item) => {
      expect(item.scaleItems[0].scaleValue).toBeUndefined();
    });
  });

  it('should handle null scaledEntries', () => {
    const stageEntries = [{ participantId: 'p1' }];

    const result = generateSeedingScaleItems({
      scaleAttributes: baseScaleAttributes,
      scaledEntries: null,
      stageEntries,
      seedsCount: 8,
      scaleName: 'U18',
    });

    expect(result.error).toBeUndefined();
    expect(result?.scaleItemsWithParticipantIds?.length).toEqual(1);
    expect(result?.scaleItemsWithParticipantIds?.[0].scaleItems[0].scaleValue).toBeUndefined();
  });

  it('should handle seedsCount greater than scaledEntries length', () => {
    const scaledEntries = [
      { participantId: 'p1', scaledValue: 10 },
      { participantId: 'p2', scaledValue: 9.5 },
    ];

    const stageEntries = [
      { participantId: 'p1' },
      { participantId: 'p2' },
      { participantId: 'p3' },
      { participantId: 'p4' },
    ];

    const result = generateSeedingScaleItems({
      scaleAttributes: baseScaleAttributes,
      scaleName: 'U18',
      scaledEntries,
      stageEntries,
      seedsCount: 8, // More seeds than scaled entries
    });

    expect(result.error).toBeUndefined();
    expect(result?.scaleItemsWithParticipantIds?.length).toEqual(4);

    // Only first 2 should have seed values
    const seededItems = result?.scaleItemsWithParticipantIds?.filter(
      (item) => item.scaleItems[0].scaleValue !== undefined,
    );
    expect(seededItems?.length).toEqual(2);
  });

  it('should handle seedsCount of 0', () => {
    const scaledEntries = [
      { participantId: 'p1', scaledValue: 10 },
      { participantId: 'p2', scaledValue: 9.5 },
    ];

    const stageEntries = [{ participantId: 'p1' }, { participantId: 'p2' }];

    const result = generateSeedingScaleItems({
      scaleAttributes: baseScaleAttributes,
      scaledEntries,
      stageEntries,
      seedsCount: 0,
      scaleName: 'U18',
    });

    expect(result.error).toBeUndefined();
    expect(result?.scaleItemsWithParticipantIds?.length).toEqual(2);

    // All participants should have undefined scaleValue
    result?.scaleItemsWithParticipantIds?.forEach((item) => {
      expect(item.scaleItems[0].scaleValue).toBeUndefined();
    });
  });

  it('should include all required properties in scale items', () => {
    const scaleAttributes: ScaleAttributes = {
      eventType: SINGLES_EVENT,
      scaleType: RATING,
      scaleName: 'WTN',
    };

    const scaledEntries = [{ participantId: 'p1', scaledValue: 10 }];
    const stageEntries = [{ participantId: 'p1' }];

    const result = generateSeedingScaleItems({
      scaleAttributes,
      scaledEntries,
      stageEntries,
      seedsCount: 1,
      scaleName: 'U18',
    });

    const scaleItem = result?.scaleItemsWithParticipantIds?.[0].scaleItems[0];

    expect(scaleItem).toHaveProperty('scaleValue');
    expect(scaleItem).toHaveProperty('eventType');
    expect(scaleItem).toHaveProperty('scaleType');
    expect(scaleItem).toHaveProperty('scaleName');
    expect(scaleItem).toHaveProperty('scaleDate');

    expect(scaleItem.eventType).toEqual(SINGLES_EVENT);
    expect(scaleItem.scaleType).toEqual(SEEDING);
    expect(scaleItem.scaleName).toEqual('U18');
  });

  it('should generate valid ISO date string for scaleDate', () => {
    const scaledEntries = [{ participantId: 'p1', scaledValue: 10 }];
    const stageEntries = [{ participantId: 'p1' }];

    const beforeTimestamp = Date.now();
    const result = generateSeedingScaleItems({
      scaleAttributes: baseScaleAttributes,
      scaleName: 'U18',
      scaledEntries,
      stageEntries,
      seedsCount: 1,
    });
    const afterTimestamp = Date.now();

    const scaleDate = result?.scaleItemsWithParticipantIds?.[0].scaleItems[0].scaleDate;
    expect(scaleDate).toBeDefined();

    // Verify it's a valid ISO string
    const parsedDate = new Date(scaleDate);
    expect(parsedDate.toISOString()).toEqual(scaleDate);

    // Verify the date is within reasonable time range (was generated during test execution)
    const dateTimestamp = parsedDate.getTime();
    expect(dateTimestamp).toBeGreaterThanOrEqual(beforeTimestamp);
    expect(dateTimestamp).toBeLessThanOrEqual(afterTimestamp);
  });

  it('should assign consecutive seed numbers starting from 1', () => {
    const scaledEntries = Array.from({ length: 8 }, (_, i) => ({
      participantId: `p${i + 1}`,
      scaledValue: 10 - i * 0.5,
    }));

    const stageEntries = scaledEntries.map(({ participantId }) => ({ participantId }));

    const result = generateSeedingScaleItems({
      scaleAttributes: baseScaleAttributes,
      scaleName: 'U18',
      scaledEntries,
      stageEntries,
      seedsCount: 8,
    });

    const seededItems = result?.scaleItemsWithParticipantIds
      ?.filter((item) => item.scaleItems[0].scaleValue !== undefined)
      ?.sort((a, b) => a.scaleItems[0].scaleValue - b.scaleItems[0].scaleValue);

    expect(seededItems?.length).toEqual(8);
    seededItems?.forEach((item, index) => {
      expect(item.scaleItems[0].scaleValue).toEqual(index + 1);
    });
  });

  it('should handle participants not in scaledEntries', () => {
    const scaledEntries = [
      { participantId: 'p1', scaledValue: 10 },
      { participantId: 'p2', scaledValue: 9 },
    ];

    const stageEntries = [
      { participantId: 'p1' },
      { participantId: 'p2' },
      { participantId: 'p3' }, // Not in scaledEntries
      { participantId: 'p4' }, // Not in scaledEntries
    ];

    const result = generateSeedingScaleItems({
      scaleAttributes: baseScaleAttributes,
      scaleName: 'U18',
      scaledEntries,
      stageEntries,
      seedsCount: 2,
    });

    expect(result?.scaleItemsWithParticipantIds?.length).toEqual(4);

    const p1 = result?.scaleItemsWithParticipantIds?.find((item) => item.participantId === 'p1');
    const p2 = result?.scaleItemsWithParticipantIds?.find((item) => item.participantId === 'p2');
    const p3 = result?.scaleItemsWithParticipantIds?.find((item) => item.participantId === 'p3');
    const p4 = result?.scaleItemsWithParticipantIds?.find((item) => item.participantId === 'p4');

    expect(p1?.scaleItems[0].scaleValue).toEqual(1);
    expect(p2?.scaleItems[0].scaleValue).toEqual(2);
    expect(p3?.scaleItems[0].scaleValue).toBeUndefined();
    expect(p4?.scaleItems[0].scaleValue).toBeUndefined();
  });

  it('should create scale items for all stageEntries regardless of seeding', () => {
    const scaledEntries = [{ participantId: 'p1', scaledValue: 10 }];

    const stageEntries = [{ participantId: 'p1' }, { participantId: 'p2' }, { participantId: 'p3' }];

    const result = generateSeedingScaleItems({
      scaleAttributes: baseScaleAttributes,
      scaleName: 'U18',
      scaledEntries,
      stageEntries,
      seedsCount: 1,
    });

    // Should have items for all 3 participants
    expect(result?.scaleItemsWithParticipantIds?.length).toEqual(3);

    // Each should have participantId and scaleItems array
    result?.scaleItemsWithParticipantIds?.forEach((item) => {
      expect(item).toHaveProperty('participantId');
      expect(item).toHaveProperty('scaleItems');
      expect(Array.isArray(item.scaleItems)).toBe(true);
      expect(item.scaleItems.length).toEqual(1);
    });
  });

  it('should handle large number of participants', () => {
    const scaledEntries = Array.from({ length: 128 }, (_, i) => ({
      participantId: `p${i + 1}`,
      scaledValue: 1000 - i,
    }));

    const stageEntries = scaledEntries.map(({ participantId }) => ({ participantId }));

    const result = generateSeedingScaleItems({
      scaleAttributes: baseScaleAttributes,
      scaleName: 'U18',
      scaledEntries,
      stageEntries,
      seedsCount: 32,
    });

    expect(result.error).toBeUndefined();
    expect(result?.scaleItemsWithParticipantIds?.length).toEqual(128);

    const seededCount = result?.scaleItemsWithParticipantIds?.filter(
      (item) => item.scaleItems[0].scaleValue !== undefined,
    ).length;
    expect(seededCount).toEqual(32);

    const unseededCount = result?.scaleItemsWithParticipantIds?.filter(
      (item) => item.scaleItems[0].scaleValue === undefined,
    ).length;
    expect(unseededCount).toEqual(96);
  });

  it('should maintain scaleType as SEEDING in all scale items', () => {
    const scaledEntries = [
      { participantId: 'p1', scaledValue: 10 },
      { participantId: 'p2', scaledValue: 9 },
    ];

    const stageEntries = [{ participantId: 'p1' }, { participantId: 'p2' }];

    const result = generateSeedingScaleItems({
      scaleAttributes: baseScaleAttributes,
      scaledEntries,
      stageEntries,
      seedsCount: 2,
      scaleName: 'U18',
    });

    result?.scaleItemsWithParticipantIds?.forEach((item) => {
      expect(item.scaleItems[0].scaleType).toEqual(SEEDING);
    });
  });

  it('should preserve eventType from scaleAttributes', () => {
    const doublesScaleAttributes: ScaleAttributes = {
      eventType: 'DOUBLES',
      scaleType: RATING,
      scaleName: 'WTN',
    };

    const scaledEntries = [{ participantId: 'p1', scaledValue: 10 }];
    const stageEntries = [{ participantId: 'p1' }];

    const result = generateSeedingScaleItems({
      scaleAttributes: doublesScaleAttributes,
      scaledEntries,
      stageEntries,
      seedsCount: 1,
      scaleName: 'U18',
    });

    expect(result?.scaleItemsWithParticipantIds?.[0]?.scaleItems?.[0]?.eventType).toEqual('DOUBLES');
  });
});

describe('seeding scale items always carry a scaleName', () => {
  // Neither `scaleName` nor `scaleAttributes.scaleName` given: the items used to be written with
  // `scaleName: undefined`, and setParticipantScaleItems accepted them (it checks the key is present,
  // not its value), so participants carried a seeding scale item no scale name could ever find.
  it('generateSeedingScaleItems and autoSeeding reject a request with no scaleName', () => {
    const {
      tournamentRecord,
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ participantsProfile: { participantsCount: 8 } }],
      setState: true,
    });
    const stageEntries = tournamentRecord.events[0].entries;
    const scaledEntries = stageEntries.map(({ participantId }) => ({ participantId }));
    const namelessAttributes: ScaleAttributes = { eventType: SINGLES_EVENT, scaleType: RATING };

    let result: any = tournamentEngine.generateSeedingScaleItems({
      scaleAttributes: namelessAttributes,
      scaledEntries,
      stageEntries,
      seedsCount: 2,
    });
    expect(result.error).toEqual(MISSING_VALUE);
    expect(result.scaleItemsWithParticipantIds).toBeUndefined();

    result = tournamentEngine.autoSeeding({
      policyDefinitions: POLICY_SEEDING_DEFAULT,
      scaleAttributes: namelessAttributes,
      sortDescending: true,
      eventId,
    });
    expect(result.error).toEqual(MISSING_VALUE);

    // a scaleName from either source is still enough
    result = tournamentEngine.generateSeedingScaleItems({
      scaleAttributes: namelessAttributes,
      scaleName: 'U18',
      scaledEntries,
      stageEntries,
      seedsCount: 2,
    });
    expect(result.scaleItemsWithParticipantIds[0].scaleItems[0].scaleName).toEqual('U18');
  });
});
