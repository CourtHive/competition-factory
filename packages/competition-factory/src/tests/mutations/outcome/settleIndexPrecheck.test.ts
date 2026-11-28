import { settleUnlessIdle } from '@Mutate/matchUps/matchUpStatus/indexPrecheck';
import { setSubscriptions } from '@Global/state/globalState';
import { afterEach, describe, expect, it, vi } from 'vitest';
import mocksEngine from '@Assemblies/engines/mock';

// constants
import { TEAM_EVENT } from '@Constants/eventConstants';

/**
 * A SETTLE PASS ASKS ITS DETECTOR OF THE STRUCTURAL INDEX BEFORE IT HYDRATES (`indexPrecheck.ts`; the v1 win, executor
 * plan § 3.1.1). Skipped only where the index answers and finds no work.
 */
afterEach(() => {
  setSubscriptions({ subscriptions: {} });
});

function draw(drawProfile: Record<string, unknown> = { drawSize: 8 }) {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({ drawProfiles: [drawProfile], setState: true });
  return { drawDefinition: tournamentRecord.events[0].drawDefinitions[0], drawId };
}

describe('settleUnlessIdle', () => {
  const settle = (drawDefinition: any, detect: (matchUps: any[]) => unknown, run = vi.fn(() => 'ran')) => ({
    result: settleUnlessIdle({ drawDefinition, site: 's', detect, run, idle: 'idle' }),
    run,
  });

  it('returns idle without running the pass where the index finds no work; runs it where it finds work', () => {
    const { drawDefinition } = draw();
    for (const nothing of [undefined, []]) {
      const { result, run } = settle(drawDefinition, () => nothing);
      expect(result).toEqual('idle');
      expect(run).not.toHaveBeenCalled();
    }
    for (const work of [{ matchUpId: 'm' }, ['m']]) {
      const { result, run } = settle(drawDefinition, () => work);
      expect(result).toEqual('ran');
      expect(run).toHaveBeenCalledTimes(1);
    }
  });

  // S7: the index covers a TEAM draw (a dual, its lines nested and listed), so its passes idle on it too
  it('asks the index of a TEAM draw too: idle where the detector finds nothing, its lines among what it reads', () => {
    const { drawDefinition } = draw({ drawSize: 4, eventType: TEAM_EVENT });
    const detect = vi.fn<(matchUps: any[]) => undefined>(() => undefined);
    const { result } = settle(drawDefinition, detect);
    expect(result).toEqual('idle');
    expect(detect).toHaveBeenCalledTimes(1);
    const read = detect.mock.calls[0][0];
    // CONTROL: the duals and their lines were indexed, not an empty array
    expect(read.filter((matchUp: any) => matchUp.tieMatchUps).length).toEqual(3);
    expect(read.filter((matchUp: any) => matchUp.collectionId).length).toBeGreaterThan(0);
  });
});
