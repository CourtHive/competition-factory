import { POLICY_RATINGS_ELO_WORLD_FOOTBALL } from '@Fixtures/policies/POLICY_RATINGS_ELO_WORLD_FOOTBALL';
import { POLICY_RATINGS_DEFAULT } from '@Fixtures/policies/POLICY_RATINGS_DEFAULT';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import scaleEngine from '@Engines/scaleEngine';
import { expect, it } from 'vitest';

// constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_RATINGS } from '@Constants/policyConstants';

// ratings policy S3 (Mentat planning/RATINGS_POLICY_PLAN.md § 3.2; CA 2026-11-05 Q4 "both"): a competitionFormat
// selects a ratings policy by preset name or inline, after a passed policy and one attached to the event or tournament

const HOCKEY = 'PER3XA-S:T20P-O:1SD/T5P-F:SO5';
const regulationWin = [
  { setNumber: 1, side1Score: 2, side2Score: 0 },
  { setNumber: 2, side1Score: 1, side2Score: 1 },
  { setNumber: 3, side1Score: 1, side2Score: 0 },
];

function rate({
  eventFormat,
  structureFormat,
  policyDefinitions,
  params = {},
}: {
  eventFormat?: any;
  structureFormat?: any;
  policyDefinitions?: any;
  params?: any;
}) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 2, matchUpFormat: HOCKEY }],
    policyDefinitions,
  });
  const event = tournamentRecord.events[0];
  if (eventFormat) event.competitionFormat = eventFormat;
  if (structureFormat) event.drawDefinitions[0].structures[0].competitionFormat = structureFormat;
  tournamentEngine.setState(tournamentRecord);

  const { matchUpId, drawId } = tournamentEngine.allTournamentMatchUps().matchUps[0];
  const outcome = { matchUpStatus: COMPLETED, score: { sets: regulationWin }, winningSide: 1 };
  expect(tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome }).success).toEqual(true);
  const { matchUp } = tournamentEngine.findMatchUp({ drawId, matchUpId, inContext: true });
  const ids = matchUp.sides.map((side) => side.participantId);

  const result: any = scaleEngine.generateDynamicRatings({ matchUpIds: [matchUpId], ...params });
  return { result, values: ids.map((id) => result.modifiedScaleValues?.[id]?.scaleValue) };
}

// a 4-1 regulation win from 1500 each: the default (K 25) gives 1513 / 1488, FiveThirtyEight NHL (K 6, log margin
// of 3) 1505 / 1495, World Football Elo (K 30, three goals × 1.75) 1526 / 1474
it('rates by the default without a competitionFormat selection', () => {
  expect(rate({}).values).toEqual([1513, 1488]);
});

it("reads the preset an event's competitionFormat names", () => {
  const { values } = rate({ eventFormat: { sport: 'OTHER', ratingsPolicy: 'POLICY_RATINGS_ELO_538_NHL' } });
  expect(values).toEqual([1505, 1495]);
});

it("reads an inline policy on the structure's competitionFormat before the event's", () => {
  const { values } = rate({
    structureFormat: { ratingsPolicy: POLICY_RATINGS_ELO_WORLD_FOOTBALL[POLICY_TYPE_RATINGS] },
    eventFormat: { ratingsPolicy: 'POLICY_RATINGS_ELO_538_NHL' },
  });
  expect(values).toEqual([1526, 1474]);
});

it("takes an attached policy, and a passed one, before the competitionFormat's", () => {
  const eventFormat = { ratingsPolicy: 'POLICY_RATINGS_ELO_538_NHL' };
  expect(rate({ eventFormat, policyDefinitions: POLICY_RATINGS_ELO_WORLD_FOOTBALL }).values).toEqual([1526, 1474]);
  const ratingsPolicy = POLICY_RATINGS_DEFAULT[POLICY_TYPE_RATINGS];
  expect(rate({ eventFormat, params: { ratingsPolicy } }).values).toEqual([1513, 1488]);
});

it.each([
  ['an unknown preset name', 'POLICY_RATINGS_NONE'],
  ['an inline policy missing its parts', { k: { rule: 'CONSTANT', value: 20 } }],
])('refuses %s before rating anything', (_, ratingsPolicy) => {
  const { result, values } = rate({ eventFormat: { ratingsPolicy } });
  expect(result.error).toEqual(INVALID_VALUES);
  expect(result.info).toMatch(/ratingsPolicy/);
  expect(values).toEqual([undefined, undefined]);
});
