import { describe, expect, test } from 'vitest';

import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { differences } from './recordDifferences';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants
import { UNRECOGNIZED_DRAW_TYPE } from '@Constants/errorConditionConstants';

/**
 * `modifyTournamentRecord` with `recordMethods` returns the engine calls that make its modifications (CA 2026-10-29).
 * Replayed onto the record as it was passed they must make the same record, apart from the times each write stamps.
 * There is no `newTournamentRecord`: the list starts from the record the caller already has.
 */
function base() {
  return mocksEngine.generateTournamentRecord({
    eventProfiles: [{ eventName: 'Existing', drawProfiles: [{ drawSize: 8 }] }],
    participantsProfile: { participantsCount: 32 },
    startDate: '2026-06-01',
    endDate: '2026-06-03',
    nonRandom: 3,
  }).tournamentRecord;
}

function replayOnto(tournamentRecord, methods) {
  tournamentEngine.reset();
  tournamentEngine.setState(tournamentRecord);
  const result: any = methods.length ? tournamentEngine.executionQueue(methods) : { success: true };
  expect(result.error ?? result.success).toEqual(true);
  return tournamentEngine.getTournament().tournamentRecord;
}

const modifications: [string, Record<string, unknown>][] = [
  ['participants', { participantsProfile: { participantsCount: 8 } }],
  ['a draw, completed', { drawProfiles: [{ drawSize: 8 }], completeAllMatchUps: true }],
  [
    'a new event with flights',
    { eventProfiles: [{ eventName: 'New', drawProfiles: [{ drawSize: 4 }, { drawSize: 4 }] }] },
  ],
  [
    'a draw added to an existing event',
    { eventProfiles: [{ eventName: 'Existing', drawProfiles: [{ drawSize: 4 }] }] },
  ],
  [
    'policies replaced on an existing event',
    {
      eventProfiles: [
        { eventName: 'Existing', policyDefinitions: { scoring: { requireParticipantsForScoring: false } } },
      ],
    },
  ],
  ['an existing event published', { eventProfiles: [{ eventName: 'Existing', publish: true }] }],
  ['venues', { venueProfiles: [{ courtsCount: 3 }] }],
];

describe('modifyTournamentRecord replays from its method list', () => {
  test.each(modifications)('%s', (_, modification) => {
    const tournamentRecord = base();
    const original = makeDeepCopy(tournamentRecord, false, true);

    const result: any = mocksEngine.modifyTournamentRecord({ ...modification, tournamentRecord, recordMethods: true });
    expect(result.success).toEqual(true);
    expect(result.methods.length).toBeGreaterThan(0);
    // the list starts from the caller's record
    expect(result.methods.some(({ method }) => method === 'newTournamentRecord')).toEqual(false);

    const replayed = replayOnto(original, result.methods);
    expect(differences(tournamentRecord, replayed)).toEqual([]);
  });

  test('scheduling the existing draw: the profile and the scheduled rounds replay', () => {
    const tournamentRecord = base();
    const original = makeDeepCopy(tournamentRecord, false, true);
    const event = tournamentRecord.events[0];
    const { drawId, structures } = event.drawDefinitions[0];
    const round = { tournamentId: tournamentRecord.tournamentId, eventId: event.eventId, drawId, roundNumber: 1 };

    const result: any = mocksEngine.modifyTournamentRecord({
      schedulingProfile: [
        {
          scheduleDate: '2026-06-01',
          venues: [{ venueId: 'v1', rounds: [{ ...round, structureId: structures[0].structureId }] }],
        },
      ],
      venueProfiles: [{ venueId: 'v1', courtsCount: 4 }],
      recordMethods: true,
      autoSchedule: true,
      tournamentRecord,
    });
    expect(result.success).toEqual(true);
    expect(result.methods.map(({ method }) => method)).toEqual(
      expect.arrayContaining(['addVenue', 'addCourts', 'setSchedulingProfile', 'scheduleProfileRounds']),
    );
    const scheduled = tournamentEngine
      .allTournamentMatchUps({ tournamentRecord })
      .matchUps.filter(({ schedule }) => schedule?.scheduledTime);
    expect(scheduled.length).toBeGreaterThan(0);

    expect(differences(tournamentRecord, replayOnto(original, result.methods))).toEqual([]);
  });

  test('a refusal writes nothing, so returns no list; keepPartial lists what it kept', () => {
    const drawProfiles = [{ drawSize: 4 }, { drawSize: 4, drawType: 'NOT_A_DRAW_TYPE' }];

    let result: any = mocksEngine.modifyTournamentRecord({
      tournamentRecord: base(),
      drawProfiles,
      recordMethods: true,
    });
    expect(result.error).toEqual(UNRECOGNIZED_DRAW_TYPE);
    expect(result.methods).toBeUndefined();

    const tournamentRecord = base();
    const original = makeDeepCopy(tournamentRecord, false, true);
    result = mocksEngine.modifyTournamentRecord({
      tournamentRecord,
      drawProfiles,
      keepPartial: true,
      recordMethods: true,
    });
    expect(result.error).toEqual(UNRECOGNIZED_DRAW_TYPE);
    expect(differences(tournamentRecord, replayOnto(original, result.methods))).toEqual([]);
  });
});
