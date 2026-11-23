import { canonicalHash } from '@Tests/testHarness/corpus/hash';
import tournamentEngine from '@Engines/syncEngine';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

// constants and types
import { DRAW_POSITION_ASSIGNED, DRAW_POSITION_OCCUPIED } from '@Constants/errorConditionConstants';
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';
import {
  COMPLETED,
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  IN_PROGRESS,
  NOT_PLAYED,
  RETIRED,
  SUSPENDED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';

const fixtures = [
  ['Laver Cup', 'F-005-input.json'],
  ['feed-in championship', 'F-005-fic-input.json'],
] as const;

// Each call explicitly awards side 2. The double exits here exercise that winner-bearing input.
const awards = [
  RETIRED,
  WALKOVER,
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  COMPLETED,
  IN_PROGRESS,
  NOT_PLAYED,
  SUSPENDED,
  undefined,
] as const;
const winnerCases = awards.flatMap((status) =>
  fixtures.map(([draw, fixture]) => ({
    award: status?.toLowerCase() ?? 'bare winner',
    status,
    draw,
    fixture,
  })),
);

const record = () => tournamentEngine.getTournament().tournamentRecord;
const hash = () => canonicalHash(record());

function loadFixture(fixture: string, status: MatchUpStatusUnion | undefined) {
  const scenario = JSON.parse(readFileSync(new URL(`./fixtures/${fixture}`, import.meta.url), 'utf8'));
  expect(tournamentEngine.setState(scenario.initial.record).success).toBe(true);
  expect(hash()).toBe(scenario.initial.hash);
  const directive = scenario.steps[0].directive;
  const { winningSide, score } = directive.params.outcome;
  directive.params.outcome = {
    winningSide,
    ...(status && { matchUpStatus: status }),
    ...(status === RETIRED && { score }),
  };
  return directive;
}

function assertAtomicRefusal(directive: ReturnType<typeof loadFixture>, code: string) {
  const before = hash();
  const result = tournamentEngine.executionQueue([directive], false);
  expect(result.error?.code).toBe(code);
  expect(hash()).toBe(before);
}

it.each(winnerCases)('refuses a $award $draw dual without writing the record', ({ fixture, status }) => {
  assertAtomicRefusal(loadFixture(fixture, status), DRAW_POSITION_ASSIGNED.code);
});

function mainFinal(status: MatchUpStatusUnion | undefined) {
  const directive = loadFixture('F-005-fic-input.json', status);
  const [main, consolation] = record().events[0].drawDefinitions[0].structures;
  const final = main.matchUps.at(-1);
  const landing = consolation.matchUps.at(-1);
  expect(final.winningSide).toBeUndefined();
  expect(final.drawPositions).toEqual([2, 5]);
  expect(final.loserMatchUpId).toBe(landing.matchUpId);
  expect(landing.drawPositions).toEqual([1]);
  directive.params.matchUpId = final.matchUpId;

  const participantAt = (position: number) =>
    main.positionAssignments.find(({ drawPosition }) => drawPosition === position).participantId;
  return { directive, structureId: consolation.structureId, winner: participantAt(5), loser: participantAt(2) };
}

it.each(awards)('refuses a main dual award (%s) when its consolation seat is held', (status) => {
  const { directive, structureId, winner } = mainFinal(status);
  const placed = tournamentEngine.assignDrawPosition({
    drawId: directive.params.drawId,
    structureId,
    drawPosition: 1,
    participantId: winner,
  });
  expect(placed.success).toBe(true);
  assertAtomicRefusal(directive, DRAW_POSITION_OCCUPIED.code);
});

it.each([RETIRED, WALKOVER, DEFAULTED] as const)(
  'seats the main dual loser after %s when the consolation seat is free',
  (status) => {
    const { directive, loser } = mainFinal(status);
    expect(tournamentEngine.executionQueue([directive], false).success).toBe(true);
    const consolation = record().events[0].drawDefinitions[0].structures[1];
    expect(consolation.positionAssignments.find(({ drawPosition }) => drawPosition === 1)?.participantId).toBe(loser);
  },
);
