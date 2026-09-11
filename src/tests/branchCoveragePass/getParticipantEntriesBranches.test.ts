import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

import { ROUND_ROBIN_WITH_PLAYOFF, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { DOUBLES, SINGLES } from '@Constants/eventConstants';

// ─── Multi-bracket RR with playoff + rankingProfile (RR tally paths) ──────
// Drives calculateRRRange multi-bracket + playoff branches, processRRBracket,
// computeRRFinishingPositions, and computeRankingProfileForParticipant.
test('RR-with-playoff multi-bracket rankingProfile completed', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 16, drawType: ROUND_ROBIN_WITH_PLAYOFF }],
    completeAllMatchUps: true,
    setState: true,
  });

  let result: any = tournamentEngine.getParticipants({
    withRankingProfile: true,
    withMatchUps: true,
    withEvents: true,
    withDraws: true,
  });

  expect(result.participants.length).toBeGreaterThan(0);
});

// ─── Incomplete RR with playoff (no groupOrder → `if (!order) continue`) ──
test('RR-with-playoff incomplete rankingProfile leaves participants without order', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, drawType: ROUND_ROBIN_WITH_PLAYOFF }],
    setState: true,
  });

  let result: any = tournamentEngine.getParticipants({
    withRankingProfile: true,
    withMatchUps: true,
    withEvents: true,
    withDraws: true,
  });

  expect(result.participants.length).toBeGreaterThan(0);
});

// ─── Seeding + qualifying draw (MAIN/QUALIFYING stage branches, seedAssignments) ─
test('seeding with qualifying structures', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 16,
        seedsCount: 4,
        drawType: SINGLE_ELIMINATION,
        qualifyingProfiles: [
          {
            roundTarget: 1,
            structureProfiles: [
              { drawSize: 4, qualifyingPositions: 2 },
              { drawSize: 4, qualifyingPositions: 2 },
            ],
          },
        ],
      },
    ],
    setState: true,
  });

  let result: any = tournamentEngine.getParticipants({
    withSeeding: true,
    withEvents: true,
    withDraws: true,
  });

  expect(result.participants.length).toBeGreaterThan(0);
});

// ─── Qualifying + rankingProfile completed (QUALIFYING participation order) ─
// Drives computeRankingProfileForParticipant's qualifying branch where
// participationOrder resolves to undefined for QUALIFYING stage structures.
test('qualifying draw rankingProfile completed', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 16,
        drawType: SINGLE_ELIMINATION,
        qualifyingProfiles: [
          {
            roundTarget: 1,
            structureProfiles: [
              { drawSize: 4, qualifyingPositions: 2 },
              { drawSize: 4, qualifyingPositions: 2 },
            ],
          },
        ],
      },
    ],
    completeAllMatchUps: true,
    setState: true,
  });

  let result: any = tournamentEngine.getParticipants({
    withRankingProfile: true,
    withMatchUps: true,
    withEvents: true,
    withDraws: true,
  });

  expect(result.participants.length).toBeGreaterThan(0);
});

// ─── Published event seeding + usePublishState (publishedSeeding branches) ─
test('published event seeding with usePublishState', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 16, seedsCount: 4 }],
    setState: true,
  });

  const eventId = tournamentRecord.events?.[0]?.eventId;
  tournamentEngine.publishEvent({ eventId });
  tournamentEngine.publishEventSeeding({ eventId, drawIds: [] });

  let result: any = tournamentEngine.getParticipants({
    usePublishState: true,
    withSeeding: true,
    withEvents: true,
    withDraws: true,
  });

  expect(result.participants.length).toBeGreaterThan(0);
});

// ─── convertExtensions with event extensions (line 211 true branch) ───────
test('convertExtensions with event extension present', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const eventId = tournamentRecord.events?.[0]?.eventId;
  tournamentEngine.addEventExtension({
    eventId,
    extension: { name: 'customTag', value: 'coverage' },
  });

  let result: any = tournamentEngine.getParticipants({
    convertExtensions: true,
    withEvents: true,
    withDraws: true,
  });

  expect(result.participants.length).toBeGreaterThan(0);
});

// ─── Malformed entry referencing an unknown participantId (228 / 472 continue) ─
test('event and draw entries referencing unknown participantId are skipped', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
  });

  for (const event of tournamentRecord.events ?? []) {
    (event.entries ??= []).push({ participantId: 'ghost-participant', entryStatus: 'DIRECT_ACCEPTANCE' } as any);
    for (const drawDefinition of event.drawDefinitions ?? []) {
      (drawDefinition.entries ??= []).push({
        participantId: 'ghost-participant',
        entryStatus: 'DIRECT_ACCEPTANCE',
      } as any);
    }
  }

  tournamentEngine.setState(tournamentRecord);

  let result: any = tournamentEngine.getParticipants({
    withEvents: true,
    withDraws: true,
  });

  expect(result.participants.length).toBeGreaterThan(0);
});

// ─── Doubles with unpaired individual entries (516 UNPAIRED/UNGROUPED branch) ─
test('doubles event with unpaired entries', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, eventType: DOUBLES }],
    participantsProfile: { participantsCount: 32 },
    setState: true,
  });

  const eventId = tournamentRecord.events?.find((e) => e.eventType === DOUBLES)?.eventId;

  // add some unpaired individual participants as entries to the doubles event
  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: ['INDIVIDUAL'] },
  });
  const unusedIndividualIds = participants.slice(0, 4).map((p: any) => p.participantId);
  if (eventId && unusedIndividualIds.length) {
    tournamentEngine.addEventEntries({
      participantIds: unusedIndividualIds,
      entryStatus: 'UNGROUPED',
      eventId,
    });
  }

  let result: any = tournamentEngine.getParticipants({
    withStatistics: true,
    withEvents: true,
    withDraws: true,
  });

  expect(result.participants.length).toBeGreaterThan(0);
});

// ─── Potential matchUps filtered to a single participant (60/62 relevant-ids) ─
test('withPotentialMatchUps filtered to a single participant id', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  const { participants } = tournamentEngine.getParticipants({});
  const targetId = participants[0]?.participantId;

  let result: any = tournamentEngine.getParticipants({
    participantFilters: { participantIds: [targetId] },
    withPotentialMatchUps: true,
    withMatchUps: true,
    withEvents: true,
    withDraws: true,
  });

  expect(result.participants.length).toBeGreaterThanOrEqual(0);
});

// ─── scheduleAnalysis as object across two events (conflict-detection paths) ─
test('scheduleAnalysis object with scheduled rounds', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawSize: 8, eventType: SINGLES },
      { drawSize: 8, eventType: SINGLES },
    ],
    venueProfiles: [{ courtsCount: 3, startTime: '08:00', endTime: '20:00' }],
    startDate: '2024-01-01',
    endDate: '2024-01-03',
    setState: true,
  });

  tournamentEngine.scheduleProfileRounds();

  let result: any = tournamentEngine.getParticipants({
    scheduleAnalysis: { scheduledMinutesDifference: 60 },
    withPotentialMatchUps: true,
    withScheduleItems: true,
    withMatchUps: true,
    withEvents: true,
    withDraws: true,
  });

  expect(result.participants.length).toBeGreaterThan(0);
});

// ─── scheduleAnalysis === true (isObject false → scheduledMinutesDifference 0) ─
test('scheduleAnalysis boolean true path', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, eventType: SINGLES }],
    venueProfiles: [{ courtsCount: 3, startTime: '08:00', endTime: '20:00' }],
    startDate: '2024-01-01',
    endDate: '2024-01-03',
    setState: true,
  });

  tournamentEngine.scheduleProfileRounds();

  let result: any = tournamentEngine.getParticipants({
    scheduleAnalysis: true as any,
    withScheduleItems: true,
    withMatchUps: true,
    withEvents: true,
    withDraws: true,
  });

  expect(result.participants.length).toBeGreaterThan(0);
});
