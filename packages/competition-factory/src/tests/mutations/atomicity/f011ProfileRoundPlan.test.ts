import { expectRefusalLeavesRecord, OUTCOME_MODES, withPipeline } from './refusalGate';
import asyncGlobalState from '@Server/providers/factory/engines/asyncGlobalState';
import { setSchemaWriteMode, setStateProvider } from '@Global/state/globalState';
import { captureNotices } from '../notifications/noticeConformance/harness';
import syncGlobalState from '@Global/state/syncGlobalState';
import { describe, expect, it } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import asyncEngine from '@Engines/asyncEngine';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

// constants
import { EXISTING_ROUND, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { MODIFY_SCHEDULING_PROFILE, MUTATIONS } from '@Constants/topicConstants';
import { SCHEDULING_PROFILE } from '@Constants/extensionConstants';

/**
 * addSchedulingProfileRound decides the date, the venue, the round and the validity of the whole proposed
 * profile before writing. Before the fix it appended the round to the stored venue and only then validated the
 * profile, so a round naming a draw that is not there stayed in the profile though the call was refused.
 */
const findings = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/f011.json.gz', import.meta.url))).toString());

const scheduleDate = '2022-01-03';
function profiled({ profile = true }: { profile?: boolean } = {}) {
  const { tournamentRecord, venueIds } = mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 4 }, { courtsCount: 4 }],
    drawProfiles: [{ drawSize: 16 }, { drawSize: 8 }],
    startDate: '2022-01-01',
    endDate: '2022-01-07',
  });
  tournamentEngine.setState(tournamentRecord);
  const firstRound = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } }).matchUps;
  const first = firstRound[0];
  const round = ({ tournamentId, eventId, drawId, structureId }, roundNumber = 1) => ({
    tournamentId,
    structureId,
    roundNumber,
    eventId,
    drawId,
  });
  if (profile)
    expect(
      tournamentEngine.addSchedulingProfileRound({ round: round(first), venueId: venueIds[0], scheduleDate }).success,
    ).toBe(true);
  const other = firstRound.find(({ drawId }) => drawId !== first.drawId);
  const initial = structuredClone(tournamentEngine.getTournament().tournamentRecord);
  return { initial, venueIds, round, first, other };
}

// a valid date and venue, and a round whose draw reference the proposed profile's validation refuses
const lateRefusals = (writeMode?: string) => {
  const stored = profiled();
  const bare = profiled({ profile: false });
  const bogus = (r: any) => ({ ...r, drawId: 'bogusId' });
  return [
    ['stored date and venue', stored, { round: bogus(stored.round(stored.first, 3)), venueId: stored.venueIds[0] }],
    ['stored date, new venue', stored, { round: bogus(stored.round(stored.first, 2)), venueId: stored.venueIds[1] }],
    [
      'new date',
      stored,
      { round: bogus(stored.round(stored.first, 2)), venueId: stored.venueIds[0], date: '2022-01-04' },
    ],
    ['no profile at all', bare, { round: bogus(bare.round(bare.first)), venueId: bare.venueIds[0] }],
  ].map(([name, { initial }, { round, venueId, date }]: any) => ({
    name,
    initial,
    writeMode,
    code: INVALID_VALUES.code,
    directive: {
      method: 'addSchedulingProfileRound',
      params: { round, venueId, scheduleDate: date ?? scheduleDate },
    },
  }));
};

describe('scheduling-profile round', () => {
  for (const mode of OUTCOME_MODES) {
    for (const borrowed of [false, true]) {
      it(`${mode}, borrowed=${borrowed}: the finding fixture leaves the record unchanged`, () => {
        withPipeline(mode, () => findings.forEach((finding) => expectRefusalLeavesRecord(finding, borrowed)));
      });
      for (const writeMode of ['native', 'legacy', 'bridge']) {
        it(`${mode}, borrowed=${borrowed}, ${writeMode}: a late refusal after a valid proposed edit writes nothing`, () => {
          setSchemaWriteMode(writeMode as any);
          const cases = lateRefusals(writeMode);
          setSchemaWriteMode();
          withPipeline(mode, () => cases.forEach((refusal) => expectRefusalLeavesRecord(refusal, borrowed)));
        });
      }
    }
  }

  it('refuses a stale round (its draw deleted) and an existing round before writing', () => {
    const { initial, round, first, venueIds } = profiled();
    tournamentEngine.setState(structuredClone(initial));
    expect(tournamentEngine.deleteDrawDefinitions({ eventId: first.eventId, drawIds: [first.drawId] }).success).toBe(
      true,
    );
    const afterDeletion = structuredClone(tournamentEngine.getTournament().tournamentRecord);
    expectRefusalLeavesRecord(
      {
        initial: afterDeletion,
        code: INVALID_VALUES.code,
        directive: {
          method: 'addSchedulingProfileRound',
          params: { round: round(first, 2), venueId: venueIds[0], scheduleDate: '2022-01-05' },
        },
      },
      true,
    );
    expectRefusalLeavesRecord(
      {
        initial,
        code: EXISTING_ROUND.code,
        directive: {
          method: 'addSchedulingProfileRound',
          params: { round: round(first), venueId: venueIds[0], scheduleDate },
        },
      },
      true,
    );
  });

  for (const writeMode of ['native', 'legacy', 'bridge'] as const) {
    it(`${writeMode}: an accepted round is stored in place on a borrowed record and announced once`, () => {
      setSchemaWriteMode(writeMode);
      try {
        const { initial, round, other, venueIds } = profiled();
        const record = structuredClone(initial);
        tournamentEngine.setState(record, false);
        const readProfile = () =>
          record.scheduling?.profile ?? record.extensions?.find(({ name }) => name === SCHEDULING_PROFILE)?.value;
        const stored = readProfile();
        const notices = captureNotices(() => {
          const result = tournamentEngine.addSchedulingProfileRound({
            round: round(other),
            venueId: venueIds[1],
            scheduleDate,
          });
          expect(result).toEqual({ success: true });
        });
        // the stored array and its date entry take the venue in place
        expect(readProfile()).toBe(stored);
        expect(stored).toHaveLength(1);
        expect(stored[0].venues.map(({ venueId }) => venueId)).toEqual(venueIds);
        expect(stored[0].venues[1].rounds).toEqual([round(other)]);
        expect(notices.map(({ topic }) => topic)).toEqual([MODIFY_SCHEDULING_PROFILE, MUTATIONS]);
        // the payload carries the stored profile (a read-only view of it when the notice payload detector is on)
        expect(notices[0].payload.schedulingProfile).toEqual(stored);
      } finally {
        setSchemaWriteMode();
      }
    });
  }

  it('isolates interleaved async requests', async () => {
    const { initial, round, first, other, venueIds } = profiled();
    setStateProvider(asyncGlobalState);
    try {
      const request = (params: any) =>
        asyncGlobalState.runWithInstanceState(async () => {
          await asyncEngine.setState(structuredClone(initial));
          const result: any = await asyncEngine.executionQueue(
            [{ method: 'addSchedulingProfileRound', params }],
            false,
          );
          await new Promise((resolve) => setTimeout(resolve, 0));
          const record = (await asyncEngine.getTournament()).tournamentRecord;
          return { result, profile: record.scheduling?.profile };
        });
      const [refused, accepted] = await Promise.all([
        request({ round: { ...round(first, 3), drawId: 'bogusId' }, venueId: venueIds[0], scheduleDate }),
        request({ round: round(other), venueId: venueIds[1], scheduleDate }),
      ]);
      expect(refused.result.error?.code).toEqual(INVALID_VALUES.code);
      expect(refused.profile).toEqual(initial.scheduling.profile);
      expect(accepted.result.success).toBe(true);
      expect(accepted.profile[0].venues).toHaveLength(2);
    } finally {
      setStateProvider(syncGlobalState);
    }
  });
});
