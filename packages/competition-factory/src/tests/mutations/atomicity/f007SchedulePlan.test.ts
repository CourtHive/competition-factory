import { expectRefusalLeavesRecord, OUTCOME_MODES, withPipeline } from './refusalGate';
import asyncGlobalState from '@Server/providers/factory/engines/asyncGlobalState';
import { setSchemaWriteMode, setStateProvider } from '@Global/state/globalState';
import { captureNotices } from '../notifications/noticeConformance/harness';
import syncGlobalState from '@Global/state/syncGlobalState';
import { describe, expect, it } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import asyncEngine from '@Engines/asyncEngine';

// constants
import { ADD_VENUE, MODIFY_DRAW_DEFINITION, MODIFY_MATCHUP, MUTATIONS } from '@Constants/topicConstants';
import { END_TIME, RESUME_TIME, START_TIME, STOP_TIME } from '@Constants/timeItemConstants';
import {
  INVALID_END_TIME,
  INVALID_RESUME_TIME,
  INVALID_STOP_TIME,
  INVALID_VALUES,
  MATCHUP_NOT_FOUND,
  VENUE_NOT_FOUND,
} from '@Constants/errorConditionConstants';

/**
 * F-007: one read-only schedule plan for addMatchUpScheduleItems, in every schema write mode. The rules run in their
 * public order against the stored draw and a working copy of the target matchUp; nothing is copied but that matchUp's
 * own schedule and timeItems, and nothing is written until the whole request is accepted. The commit installs the
 * changed fields on the stored matchUp, keeping its schedule object and appending to its timeItems.
 */
const scheduledDate = '2022-01-03';
const WRITE_MODES = ['native', 'legacy', 'bridge'] as const;

function scheduled({ assigned = 0 } = {}) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 4, idPrefix: 'c', venueId: 'v1' }],
    drawProfiles: [{ drawSize: 8, idPrefix: 'm', drawId: 'drawId' }],
    endDate: '2022-01-07',
    startDate: '2022-01-01',
  });
  tournamentEngine.setState(tournamentRecord);
  const matchUps = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } }).matchUps;
  for (let index = 0; index < assigned; index++) {
    const schedule = { scheduledDate, courtId: 'c-1', courtOrder: index + 1, scheduledTime: '09:00' };
    const { matchUpId } = matchUps[index];
    expect(tournamentEngine.addMatchUpScheduleItems({ drawId: 'drawId', matchUpId, schedule }).success).toBe(true);
  }
  const initial = structuredClone(tournamentEngine.getTournament().tournamentRecord);
  const target = (index = 0) => ({ drawId: 'drawId', matchUpId: matchUps[index].matchUpId });
  return { initial, target };
}

// valid attributes first, then the one the plan refuses: before F-007 each valid one was written as it was reached
const lateRefusals = () => {
  const { initial, target } = scheduled({ assigned: 1 });
  const call = (schedule: any, code: string, extra = {}) => ({
    directive: {
      method: 'addMatchUpScheduleItems',
      params: { ...target(1), ...extra, schedule: { scheduledDate, ...schedule } },
    },
    initial,
    code,
  });
  return [
    call({ courtId: 'c-2', startTime: '08:15', stopTime: '08:20', resumeTime: '08:10' }, INVALID_RESUME_TIME.code),
    call({ courtId: 'c-2', venueId: 'v1', startTime: '08:15', stopTime: '08:00' }, INVALID_STOP_TIME.code),
    call({ venueId: 'v1', courtOrder: 2, startTime: '10:15', endTime: '10:00' }, INVALID_END_TIME.code),
    call({ courtId: 'c-2', courtAnnotation: 'show', timeModifiers: 'NB' }, INVALID_VALUES.code),
    call({ courtOrder: 4, venueId: 'nowhere' }, VENUE_NOT_FOUND.code),
    call({ courtId: 'c-1', courtOrder: 1 }, 'ERR_SCHEDULE_CONFLICT_DOUBLE_BOOKING', { proConflictDetection: true }),
    {
      directive: {
        method: 'addMatchUpScheduleItems',
        params: { drawId: 'drawId', matchUpId: 'gone', schedule: { scheduledDate } },
      },
      code: MATCHUP_NOT_FOUND.code,
      initial,
    },
  ];
};

describe('F-007 read-only schedule plan', () => {
  for (const mode of OUTCOME_MODES) {
    for (const borrowed of [false, true]) {
      for (const writeMode of WRITE_MODES) {
        it(`${mode}, borrowed=${borrowed}, ${writeMode}: a late refusal after valid attributes writes nothing`, () => {
          setSchemaWriteMode(writeMode);
          const cases = lateRefusals().map((item) => ({ ...item, writeMode }));
          setSchemaWriteMode();
          withPipeline(mode, () => cases.forEach((item) => expectRefusalLeavesRecord(item, borrowed)));
        });
      }
    }
  }

  for (const writeMode of WRITE_MODES) {
    it(`${writeMode}: the valid multi-attribute control keeps the stored schedule object and appends the timeItems`, () => {
      setSchemaWriteMode(writeMode);
      try {
        const { initial, target } = scheduled({ assigned: 1 });
        const record = structuredClone(initial);
        tournamentEngine.setState(record, false);
        const stored = () =>
          record.events[0].drawDefinitions[0].structures[0].matchUps.find(
            ({ matchUpId }) => matchUpId === target(0).matchUpId,
          );
        const { schedule, timeItems } = stored();
        const priorItems = [...(timeItems ?? [])];
        let result: any;
        const notices = captureNotices(() => {
          result = tournamentEngine.addMatchUpScheduleItems({
            ...target(0),
            schedule: {
              startTime: '08:15',
              stopTime: '08:20',
              resumeTime: '08:35',
              endTime: '10:15',
              courtAnnotation: 'show',
            },
          });
        });
        expect(result).toEqual({ success: true });
        if (schedule) expect(stored().schedule).toBe(schedule);
        if (timeItems) {
          expect(stored().timeItems).toBe(timeItems);
          expect(stored().timeItems.slice(0, priorItems.length)).toEqual(priorItems);
        }
        const types = stored()
          .timeItems.map(({ itemType }) => itemType)
          .filter((type) => type.startsWith('SCHEDULE.TIME'));
        expect(types).toEqual(expect.arrayContaining([START_TIME, STOP_TIME, RESUME_TIME, END_TIME]));
        expect(notices.map(({ topic }) => topic)).toEqual([MODIFY_DRAW_DEFINITION, MODIFY_MATCHUP, MUTATIONS]);
        expect(notices[1].payload.matchUp).toBe(stored());
      } finally {
        setSchemaWriteMode();
      }
    });
  }

  it('copies a venue only a linked record holds, announcing only the matchUp, as before', () => {
    const { initial, target } = scheduled();
    const linked = { ...structuredClone(initial), tournamentId: 'linked', events: [] };
    linked.venues = [{ venueId: 'far', venueName: 'Far', courts: [{ courtId: 'far-1', courtName: 'Far 1' }] }];
    tournamentEngine.setState([{ ...structuredClone(initial), venues: [] }, linked]);
    expect(tournamentEngine.linkTournaments().success).toBe(true);
    const local = structuredClone(tournamentEngine.getState().tournamentRecords[initial.tournamentId]);
    const linkedRecord = structuredClone(tournamentEngine.getState().tournamentRecords.linked);
    tournamentEngine.setState([structuredClone(local), structuredClone(linkedRecord)]);
    tournamentEngine.setTournamentId(local.tournamentId);
    let result: any;
    const notices = captureNotices(() => {
      result = tournamentEngine.addMatchUpScheduleItems({ ...target(0), schedule: { scheduledDate, venueId: 'far' } });
    });
    expect(result.success).toBe(true);
    const { tournamentRecords } = tournamentEngine.getState();
    expect(tournamentRecords[local.tournamentId].venues.map(({ venueId }) => venueId)).toEqual(['far']);
    expect(tournamentRecords[local.tournamentId].venues[0]).not.toBe(tournamentRecords.linked.venues[0]);
    expect(notices.map(({ topic }) => topic)).not.toContain(ADD_VENUE);
    expect(notices.map(({ topic }) => topic)).toContain(MODIFY_MATCHUP);

    // and a refusal after the copy was planned stores no copy
    tournamentEngine.setState([structuredClone(local), structuredClone(linkedRecord)]);
    tournamentEngine.setTournamentId(local.tournamentId);
    const refused = tournamentEngine.addMatchUpScheduleItems({
      ...target(0),
      schedule: { scheduledDate, venueId: 'far', startTime: '10:00', endTime: '09:00' },
    });
    expect(refused.error).toEqual(INVALID_END_TIME);
    expect(tournamentEngine.getState().tournamentRecords[local.tournamentId].venues).toEqual([]);
  });

  it('validateOnly and the outcome preflight plan without writing', () => {
    const { initial, target } = scheduled();
    tournamentEngine.setState(structuredClone(initial));
    const before = JSON.stringify(tournamentEngine.getState());
    const result = tournamentEngine.addMatchUpScheduleItems({
      ...target(0),
      schedule: { scheduledDate, courtId: 'c-2', startTime: '08:00' },
      validateOnly: true,
    });
    expect(result.success).toBe(true);
    expect(JSON.stringify(tournamentEngine.getState())).toBe(before);
  });

  it('isolates interleaved async requests', async () => {
    const { initial, target } = scheduled();
    setStateProvider(asyncGlobalState);
    try {
      const request = (schedule: any) =>
        asyncGlobalState.runWithInstanceState(async () => {
          await asyncEngine.setState(structuredClone(initial));
          await new Promise((resolve) => setTimeout(resolve, 0));
          const result: any = await asyncEngine.executionQueue(
            [{ method: 'addMatchUpScheduleItems', params: { ...target(0), schedule } }],
            false,
          );
          const record = (await asyncEngine.getTournament()).tournamentRecord;
          return { result, record };
        });
      const [refused, accepted] = await Promise.all([
        request({ scheduledDate, courtId: 'c-2', startTime: '10:00', endTime: '09:00' }),
        request({ scheduledDate, courtId: 'c-2', startTime: '08:00' }),
      ]);
      expect(refused.result.error?.code).toEqual(INVALID_END_TIME.code);
      expect(JSON.stringify(refused.record)).toBe(JSON.stringify(initial));
      expect(accepted.result.success).toBe(true);
    } finally {
      setStateProvider(syncGlobalState);
    }
  });
});
