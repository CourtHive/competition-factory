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
import { COURT_NOT_FOUND, SCHEDULED_MATCHUPS } from '@Constants/errorConditionConstants';
import { MODIFY_MATCHUP, MODIFY_VENUE } from '@Constants/topicConstants';

/**
 * F-013: a court deletion is planned (court, venue, scheduled matchUps, force or policy, every assignment removal)
 * before it writes. deleteCourts is a bulk writer (ruling 7): each court is its own item, a refused court leaves the
 * record unchanged, the courts around it are still deleted, and `results` carries one entry per courtId. The first
 * refusal stays at the top level, with `committed: true` once any court was deleted, so that court's notices are
 * published (ruling 33).
 */
const findings = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/f013.json.gz', import.meta.url))).toString());
const startDate = '2026-11-25';

function scheduled({ assigned = 1 } = {}) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 4, idPrefix: 'c', venueId: 'venueId', venueAbbreviation: 'VNU' }],
    drawProfiles: [{ drawSize: 8, idPrefix: 'm', drawId: 'drawId' }],
    endDate: '2026-11-28',
    startDate,
  });
  tournamentEngine.setState(tournamentRecord);
  const { matchUps } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } });
  const { courts } = tournamentEngine.getCourts();
  for (let index = 0; index < assigned; index++) {
    const result = tournamentEngine.addMatchUpScheduleItems({
      schedule: { courtId: courts[0].courtId, venueId: 'venueId', scheduledDate: startDate, courtOrder: index + 1 },
      matchUpId: matchUps[index].matchUpId,
      drawId: 'drawId',
    });
    expect(result.success).toBe(true);
  }
  const initial = structuredClone(tournamentEngine.getTournament().tournamentRecord);
  return { initial, courtIds: courts.map(({ courtId }) => courtId) };
}

const refusal = (initial, method: string, params: any, code: string) => ({
  directive: { method, params },
  initial,
  code,
});

describe('F-013 court deletion', () => {
  for (const mode of OUTCOME_MODES) {
    for (const borrowed of [false, true]) {
      for (const writeMode of ['native', 'legacy'] as const) {
        it(`${mode}, borrowed=${borrowed}, ${writeMode}: a refused court deletion writes nothing`, () => {
          setSchemaWriteMode(writeMode);
          const { initial, courtIds } = scheduled({ assigned: 2 });
          setSchemaWriteMode();
          const cases = [
            refusal(initial, 'deleteCourt', { courtId: courtIds[0] }, SCHEDULED_MATCHUPS.code),
            refusal(initial, 'deleteCourt', { courtId: 'bogus' }, COURT_NOT_FOUND.code),
            refusal(initial, 'deleteCourts', { courtIds: [courtIds[0]] }, SCHEDULED_MATCHUPS.code),
            refusal(initial, 'deleteCourts', { courtIds: ['bogus', courtIds[0]] }, COURT_NOT_FOUND.code),
          ].map((item) => ({ ...item, writeMode }));
          withPipeline(mode, () => cases.forEach((item) => expectRefusalLeavesRecord(item, borrowed)));
        });
      }
    }
  }

  it('a court scheduled in a second linked record is refused before the first record is written', () => {
    const { initial, courtIds } = scheduled({ assigned: 1 });
    const unscheduled = scheduled({ assigned: 0 }).initial;
    // the same venue and court ids in a second record, where the court is free
    const linked = { ...structuredClone(unscheduled), tournamentId: 'linked' };
    tournamentEngine.setState([linked, structuredClone(initial)]);
    const before = JSON.stringify(tournamentEngine.getState());
    const notices = captureNotices(() => {
      const result = tournamentEngine.deleteCourt({ courtId: courtIds[0] });
      expect(result.error).toEqual(SCHEDULED_MATCHUPS);
    });
    expect(JSON.stringify(tournamentEngine.getState())).toBe(before);
    expect(notices).toEqual([]);
  });

  for (const mode of OUTCOME_MODES) {
    it(`${mode}: each court of a bulk deletion is its own item, refused items in place, later items still deleted`, () => {
      withPipeline(mode, () => {
        const { initial, courtIds } = scheduled({ assigned: 1 });
        for (const borrowed of [false, true]) {
          const record = structuredClone(initial);
          tournamentEngine.setState(record, !borrowed);
          const venueBefore = record.venues[0];
          let result: any;
          const notices = captureNotices(() => {
            result = tournamentEngine.deleteCourts({
              courtIds: ['bogus', courtIds[1], courtIds[0], courtIds[1], courtIds[2]],
            });
          });
          expect(result).toEqual(expect.objectContaining({ error: COURT_NOT_FOUND, committed: true }));
          expect(result.results).toEqual([
            { index: 0, courtId: 'bogus', error: COURT_NOT_FOUND },
            { index: 1, courtId: courtIds[1], success: true },
            { index: 2, courtId: courtIds[0], error: SCHEDULED_MATCHUPS, info: expect.any(String) },
            { index: 3, courtId: courtIds[1], error: COURT_NOT_FOUND },
            { index: 4, courtId: courtIds[2], success: true },
          ]);
          const stored = tournamentEngine.getTournament().tournamentRecord;
          expect(stored.venues[0].courts.map(({ courtId }) => courtId)).toEqual([courtIds[0], courtIds[3]]);
          // the deleted courts' MODIFY_VENUE is published, once for the venue (keyed), with the venue as committed
          expect(notices.filter(({ topic }) => topic === MODIFY_VENUE)).toHaveLength(1);
          expect(notices.find(({ topic }) => topic === MODIFY_VENUE)?.payload.venue.courts).toHaveLength(2);
          if (borrowed) expect(stored.venues[0]).toBe(venueBefore);
        }
      });
    });
  }

  for (const writeMode of ['native', 'legacy', 'bridge'] as const) {
    it(`${writeMode}: a forced deletion removes every assignment, then the court, and announces each`, () => {
      setSchemaWriteMode(writeMode);
      try {
        const { initial, courtIds } = scheduled({ assigned: 2 });
        tournamentEngine.setState(initial, false);
        let result: any;
        const notices = captureNotices(() => {
          result = tournamentEngine.deleteCourts({ courtIds: [courtIds[0]], force: true });
        });
        expect(result).toEqual({ success: true, results: [{ index: 0, courtId: courtIds[0], success: true }] });
        const topics = notices.map(({ topic }) => topic);
        expect(topics.filter((topic) => topic === MODIFY_MATCHUP)).toHaveLength(2);
        expect(topics.indexOf(MODIFY_VENUE)).toBeGreaterThan(-1);
        const { matchUps } = tournamentEngine.allTournamentMatchUps({ inContext: false });
        for (const matchUp of matchUps) {
          expect(matchUp.schedule?.courtId).toBeUndefined();
          expect(matchUp.timeItems?.some(({ itemType }) => itemType === 'SCHEDULE.ASSIGNMENT.COURT') ?? false).toBe(
            false,
          );
        }
        expect(initial.venues[0].courts.map(({ courtId }) => courtId)).toEqual(courtIds.slice(1));
      } finally {
        setSchemaWriteMode();
      }
    });
  }

  it('the finding fixture: the valid court stays deleted, the unknown one is refused, and the deletion is announced', () => {
    for (const finding of findings) {
      tournamentEngine.setState(structuredClone(finding.initial));
      let result: any;
      const notices = captureNotices(() => {
        result = tournamentEngine.executionQueue([structuredClone(finding.directive)], false);
      });
      expect(result.error?.code).toEqual(COURT_NOT_FOUND.code);
      expect(tournamentEngine.getVenuesAndCourts().courts).toHaveLength(finding.initial.venues[0].courts.length - 1);
      expect(notices.map(({ topic }) => topic)).toContain(MODIFY_VENUE);
    }
  });

  it('isolates interleaved async requests', async () => {
    const { initial, courtIds } = scheduled({ assigned: 1 });
    setStateProvider(asyncGlobalState);
    try {
      const request = (params: any) =>
        asyncGlobalState.runWithInstanceState(async () => {
          await asyncEngine.setState(structuredClone(initial));
          await new Promise((resolve) => setTimeout(resolve, 0));
          const result: any = await asyncEngine.executionQueue([{ method: 'deleteCourt', params }], false);
          const record = (await asyncEngine.getTournament()).tournamentRecord;
          return { result, courts: record.venues[0].courts.length };
        });
      const [refused, accepted] = await Promise.all([
        request({ courtId: courtIds[0] }),
        request({ courtId: courtIds[1] }),
      ]);
      expect(refused.result.error?.code).toEqual(SCHEDULED_MATCHUPS.code);
      expect(refused.courts).toEqual(4);
      expect(accepted.result.success).toBe(true);
      expect(accepted.courts).toEqual(3);
    } finally {
      setStateProvider(syncGlobalState);
    }
  });
});
