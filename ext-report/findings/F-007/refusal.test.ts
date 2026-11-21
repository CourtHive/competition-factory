import { canonicalJson } from '@Tools/canonicalJson';
import { setOutcomePipeline } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { afterEach, expect, it } from 'vitest';
import { setClock } from '@Tools/clock';

afterEach(() => {
  setOutcomePipeline();
  setClock();
});

for (const mode of ['v1', 'v2', 'differential'] as const) {
  it.each([false, true])(`${mode} leaves no start time on an invalid resume, rollback=%s`, (rollback) => {
    setClock('2026-10-25T09:00:00Z');
    setOutcomePipeline(mode);
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, drawId: 'd' }],
      nonRandom: 1,
      setState: true,
    });
    const { matchUpId } = tournamentEngine.allDrawMatchUps({ drawId: 'd' }).matchUps[0];
    const record = () => tournamentEngine.getTournament().tournamentRecord;
    const before = canonicalJson(record());
    const result = tournamentEngine.executionQueue(
      [
        {
          method: 'addMatchUpScheduleItems',
          params: { drawId: 'd', matchUpId, schedule: { startTime: '09:00', resumeTime: '08:00' } },
        },
      ],
      rollback,
    );
    expect(result.error?.code).toBe('ERR_INVALID_RESUME_TIME');
    const line = record().events[0].drawDefinitions[0].structures[0].matchUps[0];
    expect({
      changed: canonicalJson(record()) !== before,
      start: line.timeItems?.find((i) => i.itemType === 'SCHEDULE.TIME.START')?.itemValue,
    }).toEqual({ changed: false, start: undefined });
  });
}
