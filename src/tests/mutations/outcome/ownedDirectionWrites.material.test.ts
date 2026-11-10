import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import { registerTestSeedIdentity } from '@Tests/testHarness/seedMathRandom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setClock } from '@Tools/clock';
import {
  STANDALONE_INDIRECT_CLEARS,
  STANDALONE_BARE_WINNERS,
  STANDALONE_CARRIED_CONVERGENCES,
  FMLC_NO_ARRIVAL_WINNERS,
  FMLC_NO_ARRIVAL_REAL,
  FMLC_STANDING_WINNERS,
  FMLC_STANDING_OUTSIDE,
  SUPERSEDED_OWN_RELAYS,
  SUPERSEDED_OWN_RELAY_OUTSIDE,
  play,
  consolationRecord,
  materialModes,
} from '@Tests/testHarness/outcome/directionFixtures';

// constants and types
import { BYE, DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { Scenario } from '@Tests/testHarness/outcome/directionFixtures';
import {
  MODIFY_DRAW_DEFINITION,
  MODIFY_MATCHUP,
  MODIFY_POSITION_ASSIGNMENTS,
  UPDATE_INCONTEXT_MATCHUP,
} from '@Constants/topicConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';

vi.mock('@Mutate/matchUps/matchUpStatus/setMatchUpState', async (importOriginal) => {
  const actual: any = await importOriginal();
  const { v1Writes } = await import('@Tests/testHarness/outcome/directionCounter');
  return {
    ...actual,
    setMatchUpState: (...args: any[]) => {
      v1Writes.count += 1;
      return actual.setMatchUpState(...args);
    },
  };
});

registerTestSeedIdentity('src/tests/mutations/outcome/ownedDirectionWrites.material.test.ts', (title, ordinal) => ({
  name: 'src/tests/mutations/outcome/ownedDirectionWrites.test.ts::' + title,
  ordinal,
}));

afterEach(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setSubscriptions({ subscriptions: {} });
  setClock();
});

describe('C11 standalone bare winners compare v1 and all subscribed differential notices', () => {
  it.each(STANDALONE_BARE_WINNERS)('%s v1 oracle', (label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    expect(v1.v1Writes).toEqual(1);
    expect(v1.notices).toHaveLength(label.includes('thirteen') ? 13 : 12);
  });
  it.each(STANDALONE_BARE_WINNERS)('%s subscribed differential', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
  });
});

describe('C10 standalone indirect v1 oracle and subscribed differential notices', () => {
  it.each(STANDALONE_INDIRECT_CLEARS)('%s v1 oracle', (label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    expect(v1.v1Writes).toEqual(1);
    expect(v1.notices).toHaveLength(label.includes('thirteen') ? 13 : 12);
  });
  it.each(STANDALONE_INDIRECT_CLEARS)('%s subscribed differential', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
  });
});

describe('C12 standalone carries compare the real nested writers and subscribed notices', () => {
  it.each(STANDALONE_CARRIED_CONVERGENCES)('%s v1 oracle', (label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    expect(v1.v1Writes).toEqual(2);
    expect(v1.notices).toHaveLength(label.includes('thirteen') ? 15 : 14);
  });
  it.each(STANDALONE_CARRIED_CONVERGENCES)('%s subscribed differential', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
  });
});

describe('C13 no-arrival public writers and subscribed differential notices', () => {
  it.each([...FMLC_NO_ARRIVAL_WINNERS, ...FMLC_NO_ARRIVAL_REAL])('%s v1 oracle', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    expect(v1.v1Writes).toEqual(1);
  });
  it.each([...FMLC_NO_ARRIVAL_WINNERS, ...FMLC_NO_ARRIVAL_REAL])('%s subscribed differential', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
  });
  const carried = FMLC_NO_ARRIVAL_WINNERS.filter(([, scenario]) => scenario.steps[0].outcome.matchUpStatus).map(
    ([label, scenario]): [string, Scenario] => [
      `${label}/carried still v1`,
      {
        ...scenario,
        steps: scenario.steps.map((step) => ({ ...step, params: { ...step.params, propagateExitStatus: true } })),
      },
    ],
  );
  it.each(carried)('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
      const compared = play(mode, scenario);
      expect(compared.v1Writes).toEqual(1);
      expect(compared.results).toEqual(v1.results);
      expect(compared.record).toEqual(v1.record);
      expect(compared.notices).toEqual(v1.notices);
    }
  });
});

describe('C14 standing reservations preserve their original stored records', () => {
  it.each(materialModes(FMLC_STANDING_WINNERS))('%s independent standing material', (_label, scenario, mode) => {
    const actual = play(mode, scenario);
    expect(actual.results.every((result: any) => result.success)).toEqual(true);
    expect(consolationRecord(actual.record)).toEqual(consolationRecord(actual.recordBefore));
    expect(actual.v1Writes).toEqual(mode === OUTCOME_PIPELINE_V1 ? 1 : 0);
  });
  it.each(FMLC_STANDING_WINNERS)('%s subscribed differential', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
  });
  it.each(FMLC_STANDING_OUTSIDE)('%s', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
      const compared = play(mode, scenario);
      expect(compared.v1Writes).toEqual(1);
      expect(compared.results).toEqual(v1.results);
      expect(compared.record).toEqual(v1.record);
      expect(compared.notices).toEqual(v1.notices);
    }
  });
  it.each(materialModes(FMLC_NO_ARRIVAL_REAL))(
    '%s C14 boundary: the withdrawn BYE is actually re-announced',
    (_label, scenario, mode) => {
      const actual = play(mode, scenario);
      const at = (record: string) =>
        consolationRecord(record)[0].matchUps.find(
          (matchUp: any) =>
            matchUp.roundNumber === 2 && matchUp.roundPosition === scenario.steps[0].target.roundPosition,
        );
      const before = at(actual.recordBefore);
      const after = at(actual.record);
      expect(before).toBeDefined();
      expect(after).toBeDefined();
      expect(before.matchUpStatus).toEqual(BYE);
      expect(after.matchUpStatus).toEqual(BYE);
      expect(after.updatedAt).not.toEqual(before.updatedAt);
      expect(after.updatedAt).toEqual('2026-10-25T00:01:00.000Z');
      expect(
        actual.notices.some((notice) => notice.includes('setMatchUpStatusBye') && notice.includes(after.matchUpId)),
      ).toEqual(true);
    },
  );
});

describe('C15 superseded own relay material and notice contracts', () => {
  it.each(SUPERSEDED_OWN_RELAYS)('%s subscribed differential', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    const compared = play(OUTCOME_PIPELINE_DIFFERENTIAL, scenario);
    expect(compared.results).toEqual(v1.results);
    expect(compared.record).toEqual(v1.record);
    expect(compared.notices).toEqual(v1.notices);
  });
  it.each(materialModes(SUPERSEDED_OWN_RELAYS))(
    '%s independent stored and writer contract',
    (_label, scenario, mode) => {
      const actual = play(mode, scenario);
      expect(actual.results.every((result: any) => result.success)).toEqual(true);
      const before = consolationRecord(actual.recordBefore)[0].matchUps;
      const after = consolationRecord(actual.record)[0].matchUps;
      const at = (list: any[], roundNumber: number, roundPosition: number) =>
        list.find((matchUp: any) => matchUp.roundNumber === roundNumber && matchUp.roundPosition === roundPosition);
      const mirrored = _label.includes('/mirror/');
      const producedSide = mirrored ? 2 : 1;
      const relay = at(after, 2, mirrored ? 2 : 3);
      const target = at(after, 3, mirrored ? 1 : 2);
      const targetBefore = at(before, 3, mirrored ? 1 : 2);
      const producer = at(before, 1, mirrored ? 2 : 3);
      const isDefault =
        producer.matchUpStatus === DOUBLE_DEFAULT && scenario.steps[0].outcome.matchUpStatus === DEFAULTED;
      const producedStatus = isDefault ? DEFAULTED : WALKOVER;
      const doubleStatus = isDefault ? DOUBLE_DEFAULT : DOUBLE_WALKOVER;
      expect(targetBefore.sideExitProvenance?.[producedSide]?.sourceMatchUpId).toEqual(producer.matchUpId);
      expect(relay.matchUpStatus).toEqual(doubleStatus);
      expect(relay.score).toEqual({ scoreStringSide1: '', scoreStringSide2: '' });
      expect(relay.schedule.scoredTime).toEqual('2026-10-25T00:01:00.000Z');
      expect(target.drawPositions).toEqual([]);
      expect(target.matchUpStatus).toEqual(producedStatus);
      expect(target).not.toHaveProperty('winningSide');
      expect(target.score).toEqual({ scoreStringSide1: '', scoreStringSide2: '' });
      expect(target.matchUpStatusCodes).toEqual([]);
      expect(target.schedule ?? {}).not.toHaveProperty('scoredTime');
      expect(target.sideExitProvenance).toEqual({
        [producedSide]: {
          matchUpStatus: producedStatus,
          previousMatchUpStatus: doubleStatus,
          sourceMatchUpId: relay.matchUpId,
        },
      });
      expect(at(after, 4, mirrored ? 1 : 2)).toEqual(at(before, 4, mirrored ? 1 : 2));
      expect(at(after, 2, mirrored ? 1 : 4)).toEqual(at(before, 2, mirrored ? 1 : 4));
      expect(actual.v1Writes).toEqual(mode === OUTCOME_PIPELINE_V1 ? 2 : 0);
      const notices = actual.notices.map((notice) => {
        const split = notice.indexOf(' ');
        return { topic: notice.slice(0, split), payload: JSON.parse(notice.slice(split + 1)) };
      });
      expect(notices.map(({ topic }) => topic)).toEqual([
        MODIFY_DRAW_DEFINITION,
        MODIFY_POSITION_ASSIGNMENTS,
        ...Array(6).fill(MODIFY_MATCHUP),
        ...Array(5).fill(UPDATE_INCONTEXT_MATCHUP),
      ]);
      expect(notices.filter(({ topic }) => topic === MODIFY_MATCHUP).map(({ payload }) => payload.context)).toEqual([
        'modifyMatchUpScore',
        mirrored ? 'removeDrawPosition-2' : 'removeDrawPosition-1',
        'modifyMatchUpScore',
        'assignMatchUpDrawPosition',
        'modifyMatchUpScore',
        'modifyMatchUpScore',
      ]);
      expect(notices[6].payload.matchUp.matchUpId).toEqual(relay.matchUpId);
      expect(notices[7].payload.matchUp.matchUpId).toEqual(target.matchUpId);
    },
  );
  it.each(SUPERSEDED_OWN_RELAY_OUTSIDE)('%s preserves existing boundary', (_label, scenario) => {
    const v1 = play(OUTCOME_PIPELINE_V1, scenario);
    expect(v1.results.every((result: any) => result.success)).toEqual(true);
    for (const mode of [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL] as const) {
      const compared = play(mode, scenario);
      expect(compared.results).toEqual(v1.results);
      expect(compared.record).toEqual(v1.record);
      expect(compared.notices).toEqual(v1.notices);
      // A locally owned clear still runs v1 in differential's comparison shadow.
      expect(compared.v1Writes).toEqual(_label.includes('/clear/') && mode === OUTCOME_PIPELINE_V2 ? 0 : 1);
    }
  });
});
