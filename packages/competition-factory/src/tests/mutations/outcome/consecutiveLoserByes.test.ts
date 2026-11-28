import { checkHeldByeClaims } from '@Tests/testHarness/outcome/heldByeClaimControls';
import { compareHeldClaims } from '@Tests/testHarness/outcome/compareHeldClaims';
import { prepareCall } from '@Tests/testHarness/outcome/recordedCallHarness';
import { replayStalls } from '@Tests/testHarness/exitPropagation/stallCount';
import { setSubscriptions } from '@Global/state/globalState';
import { setOutcomePipeline } from '@Tests/testHarness/outcomeModes';
import { matchUpsOf } from '@Helpers/drawTopology/structureMembers';
import { afterEach, expect, it, vi } from 'vitest';
import engine from '@Engines/syncEngine';
import { setClock } from '@Tools/clock';
import { readFileSync } from 'node:fs';

// constants and types
import { BYE, DOUBLE_WALKOVER, RETIRED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { Tournament } from '@Types/tournamentTypes';

afterEach(() => {
  vi.restoreAllMocks();
  setSubscriptions({ subscriptions: {} });
  setOutcomePipeline('v1');
  setClock();
});

const examples = [
  { seed: 20089510, file: '20261008b', step: 9, structure: 'Consolation', source: 2, donor: 3, position: 4 },
  { seed: 20137134, file: '20261009cd', step: 20, structure: 'Backdraw', source: 7, donor: 5, position: 8 },
];
type Example = (typeof examples)[number];

function seats(record: Tournament, e: Example) {
  const structures = record.events![0].drawDefinitions![0].structures!;
  const at = (name: string, r: number, p: number) =>
    matchUpsOf(structures.find((s) => s.structureName === name)!)!.find(
      (m) => m.roundNumber === r && m.roundPosition === p,
    );
  return {
    source: at('Main', 1, e.source)!,
    donor: at('Main', 1, e.donor)!,
    first: at(e.structure, 1, 1)!,
    second: at(e.structure, 2, 1)!,
    otherFirst: at(e.structure, 1, 2)!,
    award: at(e.structure, 3, 1)!,
    next: at(e.structure, 4, 1),
  };
}

function retirement(e: Example) {
  return prepareCall(() => {
    const scenarios = readFileSync(
      new URL('../../fixtures/exitPropagation/stallScaleSchedules' + e.file + '.jsonl', import.meta.url),
      'utf8',
    );
    const scenario = scenarios
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .find((s) => s.seed === e.seed && s.arm === 'policyoff');
    const drawId = 'consecutive';
    const { replay } = replayStalls({ drawId, scenario: { ...scenario, steps: scenario.steps.slice(0, e.step) } });
    expect(replay.counts.scheduleAttempted).toBe(e.step);
    const { source } = seats(engine.getTournament().tournamentRecord, e);
    expect(source.matchUpStatus).toBe('COMPLETED');
    return { drawId, matchUpId: source.matchUpId, outcome: scenario.steps[e.step].outcome, propagateExitStatus: true };
  });
}

it.each(examples)('preserves both BYE passages and the walkover supported by the opposite arm ($seed)', (e) => {
  const call = retirement(e);
  const { source: prior, ...held } = seats(call.prepared, e);
  expect([held.first.matchUpStatus, held.second.matchUpStatus]).toEqual([BYE, BYE]);
  expect(held.donor.matchUpStatus).toBe(DOUBLE_WALKOVER);
  expect(held.award).toMatchObject({ matchUpStatus: WALKOVER, winningSide: 1 });
  if (held.next) expect(held.next.drawPositions).toContain(e.position);
  const { source, ...after } = seats(compareHeldClaims(call, true), e);
  expect(source).toMatchObject({
    matchUpStatus: RETIRED,
    winningSide: prior.winningSide,
    score: { scoreStringSide1: '6-3' },
  });
  expect(after).toEqual(held);
});

it.each(examples)('retracts the carry on the opposite arm and its award when the donor is cleared ($seed)', (e) => {
  const call = retirement(e);
  const { donor, otherFirst } = seats(call.prepared, e);
  expect(otherFirst.sideExitProvenance?.[1]?.sourceMatchUpId).toBe(donor.matchUpId);
  donor.matchUpStatus = TO_BE_PLAYED;
  delete donor.score;
  const after = seats(compareHeldClaims(call, false), e);
  expect(after.otherFirst.sideExitProvenance?.[1]).toBeUndefined();
  expect(after.award.matchUpStatus).toBe(TO_BE_PLAYED);
  expect(after.award.winningSide).toBeUndefined();
});

it('restores the missing earned position after the second BYE and walkover', () => {
  const e = examples[1];
  const call = retirement(e);
  seats(call.prepared, e).next!.drawPositions = [];
  expect(seats(compareHeldClaims(call, false), e).next!.drawPositions).toEqual([e.position]);
});

it('requires both passages, their actual feeder edges and one continuous opposing carry', () => {
  const e = examples[0];
  checkHeldByeClaims(retirement(e), {
    'the first passage is already decided': ({ at }) => {
      at(e.structure, 1).matchUpStatus = WALKOVER;
    },
    'the stored winner edge skips the second BYE': ({ at }) => {
      at(e.structure, 1).winnerMatchUpId = at(e.structure, 3).matchUpId;
    },
    'the second passage has lost its opposite BYE': ({ at }) => {
      delete at(e.structure, 2).sides!.find((s) => s.bye)!.bye;
    },
    'the recorded reservation feeder actually lands at another position': ({ at }) => {
      const second = at(e.structure, 2);
      delete at('Main', 2).loserMatchUpId;
      at('Main', 1, 1).loserMatchUpId = second.matchUpId;
    },
    'the award belongs to the other side': ({ at }) => {
      at(e.structure, 3).winningSide = 2;
    },
    'the award has no foreign origin': ({ at }) => {
      delete at(e.structure, 3).sideExitProvenance;
    },
    'the donor stored a different losing edge': ({ at }) => {
      at('Main', 1, e.donor).loserMatchUpId = at(e.structure, 1, 1).matchUpId;
    },
    'a participant occupies the empty carry position on the other arm': ({ at }) => {
      at(e.structure, 1, 2).sides!.find((s) => !s.bye)!.participantId = at(e.structure, 3).sides![0].participantId;
    },
    'the other arm carries a different feeder through the second BYE': ({ at }) => {
      at(e.structure, 2, 2).sideExitProvenance![2].sourceMatchUpId = at('Main', 1, 1).matchUpId;
    },
    'the terminal award still names an onward winner edge': ({ at }) => {
      at(e.structure, 3).winnerMatchUpId = at('Main', 3).matchUpId;
    },
  });
});
