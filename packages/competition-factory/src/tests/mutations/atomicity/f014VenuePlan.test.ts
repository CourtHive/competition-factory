import { expectRefusalLeavesRecord, OUTCOME_MODES, withPipeline } from './refusalGate';
import asyncGlobalState from '@Server/providers/factory/engines/asyncGlobalState';
import { setSchemaWriteMode, setStateProvider } from '@Global/state/globalState';
import { captureNotices } from '../notifications/noticeConformance/harness';
import syncGlobalState from '@Global/state/syncGlobalState';
import { describe, expect, it } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import asyncEngine from '@Engines/asyncEngine';
import { bulkScheduleTournamentMatchUps } from '@Mutate/matchUps/schedule/bulkScheduleTournamentMatchUps';
import { venueModify } from '@Mutate/venues/modifyVenue';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

// constants
import { MODIFY_MATCHUP, MODIFY_VENUE } from '@Constants/topicConstants';
import { SCHEDULING_PROFILE } from '@Constants/extensionConstants';
import {
  INVALID_TIME,
  INVALID_VALUES,
  MISSING_TOURNAMENT_RECORD,
  NO_VALID_ATTRIBUTES,
  SCHEDULE_CONFLICT_COURT_UNAVAILABLE,
  SCHEDULED_MATCHUPS,
} from '@Constants/errorConditionConstants';

/**
 * F-014: a venue edit is planned whole before it writes: the venue's attributes, paired default times and date
 * availability, the courts it deletes (scheduled matchUps, force or policy, and the schedule clears), each court it
 * modifies or adds (availability and scheduled conflicts included), and any scheduling-profile repair, in every record
 * that holds the venue. Before the fix a refused court left the venue's new name, abbreviation and earlier courts behind.
 */
const findings = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/f014.json.gz', import.meta.url))).toString());
const scheduledDate = '2022-01-03';
const WRITE_MODES = ['native', 'legacy', 'bridge'] as const;

function venueWithSchedule({ assigned = 2 } = {}) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    venueProfiles: [
      { courtsCount: 4, idPrefix: 'c', venueId: 'v1', venueName: 'One', startTime: '08:00', endTime: '20:00' },
      { courtsCount: 2, idPrefix: 'd', venueId: 'v2', venueName: 'Two', isPrimary: true },
    ],
    drawProfiles: [{ drawSize: 8, idPrefix: 'm', drawId: 'drawId' }],
    endDate: '2022-01-07',
    startDate: '2022-01-01',
  });
  tournamentEngine.setState(tournamentRecord);
  const matchUps = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } }).matchUps;
  for (let index = 0; index < assigned; index++) {
    const schedule = { scheduledDate, courtId: 'c-1', venueId: 'v1', courtOrder: index + 1, scheduledTime: '09:00' };
    const { matchUpId } = matchUps[index];
    expect(tournamentEngine.addMatchUpScheduleItems({ drawId: 'drawId', matchUpId, schedule }).success).toBe(true);
  }
  return structuredClone(tournamentEngine.getTournament().tournamentRecord);
}

const courts = (record, ids: string[]) =>
  record.venues[0].courts
    .filter(({ courtId }) => ids.includes(courtId))
    .map(({ courtId, courtName }) => ({ courtId, courtName }));

// a valid name, primary flag and availability first, then the court the plan refuses
const lateRefusals = () => {
  const initial = venueWithSchedule();
  const edit = (modifications: any, code: string, force?: boolean) => ({
    directive: {
      method: 'modifyVenue',
      params: { venueId: 'v1', modifications, ...(force !== undefined && { force }) },
    },
    initial,
    code,
  });
  const renamed = { venueName: 'Renamed', venueAbbreviation: 'RN', isPrimary: true };
  return [
    // deleting c-1, which holds two scheduled matchUps
    edit({ ...renamed, courts: courts(initial, ['c-2', 'c-3', 'c-4']) }, SCHEDULED_MATCHUPS.code),
    // an invalid availability on an existing court, after the venue edit and a court deletion
    edit(
      {
        ...renamed,
        courts: [
          ...courts(initial, ['c-1', 'c-2']),
          { courtId: 'c-3', dateAvailability: [{ startTime: '9', endTime: '10' }] },
        ],
      },
      INVALID_TIME.code,
    ),
    // an availability that leaves c-1's scheduled matchUps outside every window
    edit(
      {
        ...renamed,
        courts: [
          { courtId: 'c-1', dateAvailability: [{ date: scheduledDate, startTime: '12:00', endTime: '13:00' }] },
          ...courts(initial, ['c-2', 'c-3', 'c-4']),
        ],
      },
      SCHEDULE_CONFLICT_COURT_UNAVAILABLE.code,
    ),
    // a new court whose id another new court of the same edit already takes
    edit(
      {
        ...renamed,
        courts: [
          ...courts(initial, ['c-1', 'c-2', 'c-3', 'c-4']),
          { courtId: 'n', courtName: 'N' },
          { courtId: 'n', courtName: 'N2', dateAvailability: [{ startTime: '24:00', endTime: '25:00' }] },
        ],
      },
      INVALID_TIME.code,
    ),
    edit(
      { ...renamed, courts: [...courts(initial, ['c-1', 'c-2', 'c-3', 'c-4']), { courtId: 'c-1' }] },
      NO_VALID_ATTRIBUTES.code,
    ),
    // a court added earlier in the same edit, modified with nothing it can take
    edit(
      {
        ...renamed,
        courts: [...courts(initial, ['c-1', 'c-2', 'c-3', 'c-4']), { courtId: 'n', courtName: 'N' }, { courtId: 'n' }],
      },
      NO_VALID_ATTRIBUTES.code,
    ),
    edit({ ...renamed, defaultStartTime: '18:00', defaultEndTime: '09:00' }, INVALID_VALUES.code),
    edit(
      { ...renamed, dateAvailability: [{ date: 'never', startTime: '08:00', endTime: '09:00' }] },
      'ERR_INVALID_DATE',
    ),
    edit({ ...renamed, courts: [{ courtId: 'd-1', courtName: 'stolen' }] }, SCHEDULED_MATCHUPS.code),
  ];
};

describe('F-014 venue edit', () => {
  for (const mode of OUTCOME_MODES) {
    for (const borrowed of [false, true]) {
      it(`${mode}, borrowed=${borrowed}: the finding fixtures leave the record unchanged`, () => {
        withPipeline(mode, () => findings.forEach((finding) => expectRefusalLeavesRecord(finding, borrowed)));
      });
      for (const writeMode of WRITE_MODES) {
        it(`${mode}, borrowed=${borrowed}, ${writeMode}: a late refusal after valid venue edits writes nothing`, () => {
          setSchemaWriteMode(writeMode);
          const cases = lateRefusals().map((item) => ({ ...item, writeMode }));
          setSchemaWriteMode();
          withPipeline(mode, () => cases.forEach((item) => expectRefusalLeavesRecord(item, borrowed)));
        });
      }
    }
  }

  it('a venue edit refused in a second linked record writes neither', () => {
    const initial = venueWithSchedule();
    const free = venueWithSchedule({ assigned: 0 });
    const linked = { ...free, tournamentId: 'linked' };
    tournamentEngine.setState([linked, structuredClone(initial)]);
    const before = JSON.stringify(tournamentEngine.getState());
    const notices = captureNotices(() => {
      const result = tournamentEngine.modifyVenue({
        modifications: { venueName: 'Renamed', courts: courts(initial, ['c-2', 'c-3', 'c-4']) },
        venueId: 'v1',
      });
      expect(result.error).toEqual(SCHEDULED_MATCHUPS);
    });
    expect(JSON.stringify(tournamentEngine.getState())).toBe(before);
    expect(notices).toEqual([]);
  });

  for (const writeMode of WRITE_MODES) {
    it(`${writeMode}: an accepted edit deletes, modifies and adds courts, clears schedules and announces in order`, () => {
      setSchemaWriteMode(writeMode);
      try {
        const initial = venueWithSchedule();
        const record = structuredClone(initial);
        tournamentEngine.setState(record, false);
        const venue = record.venues[0];
        const kept = venue.courts[1];
        let result: any;
        const notices = captureNotices(() => {
          result = tournamentEngine.modifyVenue({
            modifications: {
              venueName: 'Renamed',
              isPrimary: true,
              dateAvailability: [{ startTime: '07:00', endTime: '21:00' }],
              courts: [
                {
                  courtId: 'c-2',
                  courtName: 'Centre',
                  dateAvailability: [
                    { startTime: '08:00', endTime: '12:00' },
                    { startTime: '11:00', endTime: '18:00' },
                  ],
                },
                { courtId: 'c-3', courtName: 'Three' },
                { courtId: 'new', courtName: 'New' },
              ],
            },
            venueId: 'v1',
            force: true,
          });
        });
        expect(result).toEqual({ success: true });
        expect(record.venues[0]).toBe(venue);
        expect(venue.venueName).toEqual('Renamed');
        expect(venue.isPrimary).toBe(true);
        expect(record.venues[1].isPrimary).toBeUndefined();
        expect(venue.courts.map(({ courtId }) => courtId)).toEqual(['c-2', 'c-3', 'new']);
        expect(venue.courts[0]).toBe(kept);
        expect(kept.dateAvailability).toEqual([{ startTime: '08:00', endTime: '18:00' }]);
        const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: false });
        // the deleted court's matchUps lose their court (cleared to '' natively, as the bulk clear always stored it)
        for (const matchUp of matchUps) expect(matchUp.schedule?.courtId || undefined).toBeUndefined();
        const topics = notices.map(({ topic }) => topic);
        expect(topics.filter((topic) => topic === MODIFY_MATCHUP)).toHaveLength(2);
        expect(topics.filter((topic) => topic === MODIFY_VENUE)).toHaveLength(2);
      } finally {
        setSchemaWriteMode();
      }
    });
  }

  it('an accepted edit modifies a court it has only just added, before storing it', () => {
    const record = venueWithSchedule();
    tournamentEngine.setState(record, false);
    const result = tournamentEngine.modifyVenue({
      modifications: {
        courts: [
          ...courts(record, ['c-1', 'c-2', 'c-3', 'c-4']),
          { courtId: 'n', courtName: 'N' },
          {
            courtId: 'n',
            courtName: 'N2',
            dateAvailability: [
              { startTime: '08:00', endTime: '12:00' },
              { startTime: '11:00', endTime: '18:00' },
            ],
          },
        ],
      },
      venueId: 'v1',
    });
    expect(result).toEqual({ success: true });
    const added = record.venues[0].courts.filter(({ courtId }) => courtId === 'n');
    expect(added).toHaveLength(1);
    expect(added[0].courtName).toEqual('N2');
    expect(added[0].dateAvailability).toEqual([{ startTime: '08:00', endTime: '18:00' }]);
  });

  // a stored profile with a round whose draw is gone: an accepted venue edit stores the repair, a refused one leaves it
  const storedProfile = (record) =>
    record.scheduling?.profile ?? record.extensions?.find(({ name }) => name === SCHEDULING_PROFILE)?.value;
  function staleProfileRecord() {
    tournamentEngine.setState(venueWithSchedule());
    const [{ eventId, drawId, structureId }] = tournamentEngine.allTournamentMatchUps({ inContext: true }).matchUps;
    const tournamentId = tournamentEngine.getTournament().tournamentRecord.tournamentId;
    const round = { tournamentId, eventId, drawId, structureId, roundNumber: 1 };
    expect(
      tournamentEngine.addSchedulingProfileRound({ scheduleDate: scheduledDate, venueId: 'v1', round }).success,
    ).toBe(true);
    const record = structuredClone(tournamentEngine.getTournament().tournamentRecord);
    storedProfile(record)[0].venues[0].rounds.push({ ...round, drawId: 'gone', structureId: 'gone' });
    return { record, drawId };
  }

  for (const writeMode of WRITE_MODES) {
    it(`${writeMode}: a venue edit stores the repair of a stale scheduling profile; a refused one leaves it stale`, () => {
      setSchemaWriteMode(writeMode);
      try {
        const { record, drawId } = staleProfileRecord();
        tournamentEngine.setState(record, false);
        const before = JSON.stringify(record);
        const refused = tournamentEngine.modifyVenue({
          modifications: { venueName: 'Refused', courts: courts(record, ['c-2', 'c-3', 'c-4']) },
          venueId: 'v1',
        });
        expect(refused.error).toEqual(SCHEDULED_MATCHUPS);
        expect(JSON.stringify(record)).toBe(before);

        expect(tournamentEngine.modifyVenue({ modifications: { venueName: 'Renamed' }, venueId: 'v1' })).toEqual({
          success: true,
        });
        const rounds = storedProfile(tournamentEngine.getTournament().tournamentRecord)[0].venues[0].rounds;
        expect(rounds.map((round) => round.drawId)).toEqual([drawId]);
      } finally {
        setSchemaWriteMode();
      }
    });
  }

  it('venueModify plans one record whole: refused, it writes nothing; accepted, it returns the edited venue', () => {
    const tournamentRecord = venueWithSchedule();
    const before = JSON.stringify(tournamentRecord);
    const refused = venueModify({
      modifications: { venueName: 'Refused', courts: courts(tournamentRecord, ['c-2']) },
      tournamentRecord,
      venueId: 'v1',
    });
    expect((refused as any).error).toEqual(SCHEDULED_MATCHUPS);
    expect(JSON.stringify(tournamentRecord)).toBe(before);

    const accepted: any = venueModify({ modifications: { venueName: 'Renamed' }, tournamentRecord, venueId: 'v1' });
    expect(accepted.success).toBe(true);
    expect(tournamentRecord.venues[0].venueName).toEqual('Renamed');
    expect(accepted.venue).toEqual(tournamentRecord.venues[0]);
  });

  it('bulk scheduling without a tournament record is refused before planning', () => {
    expect(bulkScheduleTournamentMatchUps({} as any)).toEqual({ error: MISSING_TOURNAMENT_RECORD });
  });

  it('isolates interleaved async requests', async () => {
    const initial = venueWithSchedule();
    setStateProvider(asyncGlobalState);
    try {
      const request = (modifications: any) =>
        asyncGlobalState.runWithInstanceState(async () => {
          await asyncEngine.setState(structuredClone(initial));
          await new Promise((resolve) => setTimeout(resolve, 0));
          const result: any = await asyncEngine.executionQueue(
            [{ method: 'modifyVenue', params: { venueId: 'v1', modifications } }],
            false,
          );
          return { result, venue: (await asyncEngine.getTournament()).tournamentRecord.venues[0] };
        });
      const [refused, accepted] = await Promise.all([
        request({ venueName: 'Refused', courts: courts(initial, ['c-2']) }),
        request({ venueName: 'Accepted' }),
      ]);
      expect(refused.result.error?.code).toEqual(SCHEDULED_MATCHUPS.code);
      expect(refused.venue).toEqual(initial.venues[0]);
      expect(accepted.result.success).toBe(true);
      expect(accepted.venue.venueName).toEqual('Accepted');
    } finally {
      setStateProvider(syncGlobalState);
    }
  });
});
