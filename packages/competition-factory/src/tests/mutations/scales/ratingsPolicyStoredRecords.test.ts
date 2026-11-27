import { POLICY_COMPETITION_STANDARD } from '@Fixtures/policies/POLICY_COMPETITION_STANDARD';
import { formRatingsPolicy } from '@Helpers/ratings/competition/formRatingsPolicy';
import { TEMPLATE_RATINGS_ELO_538_NHL } from '@courthive/competition-catalogue';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import scaleEngine from '@Engines/scaleEngine';
import { afterEach, expect, it } from 'vitest';

// constants
import { POLICY_TYPE_COMPETITION, POLICY_TYPE_RATINGS } from '@Constants/policyConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';

// The core holds no ratings presets. A ratings policy is passed as an object; a record that holds the full policy rates
// as it always did, and a preset name, which selects nothing, is refused by name when a rating reads it.

const NHL = 'POLICY_RATINGS_ELO_538_NHL';
const NHL_POLICY = TEMPLATE_RATINGS_ELO_538_NHL[POLICY_TYPE_RATINGS];
const HOCKEY = 'PER3XA-S:T20P-O:1SD/T5P-F:SO5';
const regulationWin = [
  { setNumber: 1, side1Score: 2, side2Score: 0 },
  { setNumber: 2, side1Score: 1, side2Score: 1 },
  { setNumber: 3, side1Score: 1, side2Score: 0 },
];

afterEach(() => {
  tournamentEngine.reset();
});

/** A two-player hockey draw on an event with no competitionFormat, loaded; returns its event and matchUp ids. */
function hockeyDraw() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 2, matchUpFormat: HOCKEY }],
  });
  tournamentEngine.setState(tournamentRecord);
  const { matchUpId, drawId, eventId } = tournamentEngine.allTournamentMatchUps().matchUps[0];
  const outcome = { matchUpStatus: COMPLETED, score: { sets: regulationWin }, winningSide: 1 };
  expect(tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome }).success).toEqual(true);
  return { eventId, drawId, matchUpId };
}

function rate(matchUpId: string) {
  const { matchUp } = tournamentEngine.findMatchUp({ matchUpId, inContext: true });
  const ids = matchUp.sides.map((side) => side.participantId);
  const result: any = scaleEngine.generateDynamicRatings({ matchUpIds: [matchUpId] });
  return { result, values: ids.map((id) => result.modifiedScaleValues?.[id]?.scaleValue) };
}

/** Writes a competitionFormat onto the loaded record directly, as a stored record holds it. */
function storeFormat(eventId: string, competitionFormat: any) {
  const { tournamentRecord } = tournamentEngine.getTournament();
  tournamentRecord.events.find((event) => event.eventId === eventId).competitionFormat = competitionFormat;
  tournamentEngine.setState(tournamentRecord);
}

it('a competitionFormat given the policy object rates by it', () => {
  const { eventId, matchUpId } = hockeyDraw();
  const competitionFormat = { sport: 'OTHER', ratingsPolicy: NHL_POLICY };
  expect(tournamentEngine.modifyEvent({ eventId, eventUpdates: { competitionFormat } }).success).toEqual(true);
  expect(tournamentEngine.getEvent({ eventId }).event.competitionFormat).toEqual(competitionFormat);
  expect(rate(matchUpId).values).toEqual([1505, 1495]);
});

it('a record holding the full policy with its preset name as a label rates by the policy', () => {
  const { eventId, matchUpId } = hockeyDraw();
  storeFormat(eventId, { ratingsPolicy: NHL_POLICY, ratingsPolicyName: NHL });
  expect(rate(matchUpId).values).toEqual([1505, 1495]);
});

it('a record holding only a preset name reads unchanged, and a rating that reads it is refused by name', () => {
  const { eventId, matchUpId } = hockeyDraw();
  storeFormat(eventId, { ratingsPolicy: NHL });
  expect(tournamentEngine.getEvent({ eventId }).event.competitionFormat).toEqual({ ratingsPolicy: NHL });

  const { result, values } = rate(matchUpId);
  expect(result.error).toEqual(INVALID_VALUES);
  expect(result.info).toEqual(
    `ratingsPolicy: '${NHL}' is a preset name, which selects nothing (matchUp ${matchUpId}); pass the ratings policy object`,
  );
  expect(result.context).toEqual({ ratingsPolicy: NHL, matchUpId });
  expect(values).toEqual([undefined, undefined]);

  // attaching the policy object makes the record rate
  tournamentEngine.modifyEvent({ eventId, eventUpdates: { competitionFormat: { ratingsPolicy: NHL_POLICY } } });
  expect(rate(matchUpId).values).toEqual([1505, 1495]);
});

it('a competitionFormat attached with a preset name is stored as given, and nothing looks the name up', () => {
  mocksEngine.generateTournamentRecord({ setState: true });
  const event = { eventType: SINGLES_EVENT, competitionFormat: { ratingsPolicy: NHL } };
  const { event: added }: any = tournamentEngine.addEvent({ event });
  expect(tournamentEngine.getEvent({ eventId: added.eventId }).event.competitionFormat).toEqual({ ratingsPolicy: NHL });
});

it('an incomplete inline policy is refused as incomplete', () => {
  const { eventId, matchUpId } = hockeyDraw();
  const competitionFormat = { ratingsPolicy: { k: { rule: 'CONSTANT', value: 20 } } };
  tournamentEngine.modifyEvent({ eventId, eventUpdates: { competitionFormat } });
  const { result } = rate(matchUpId);
  expect(result.error).toEqual(INVALID_VALUES);
  expect(result.info).toMatch(/an inline ratings policy needs expectation, k and actual/);
  expect(result.context).toEqual({ matchUpId });
});

it("a competition policy's form rating refuses a preset name, and rates by a policy object or a stored value", () => {
  const named: any = {
    ratingPolicy: { dynamicFormRating: { enabled: true, initializeFrom: 'BASELINE', ratingsPolicy: NHL } },
  };
  expect(formRatingsPolicy(named)).toEqual({
    info: `dynamicFormRating.ratingsPolicy: '${NHL}' is a preset name, which selects nothing; pass the ratings policy object`,
    context: { ratingsPolicy: NHL },
    error: INVALID_VALUES,
  });

  const FORM = POLICY_COMPETITION_STANDARD[POLICY_TYPE_COMPETITION];
  const constantK = { ...NHL_POLICY, k: { rule: 'CONSTANT', value: 6 } };
  const stored: any = {
    ...FORM,
    ratingPolicy: {
      ...FORM.ratingPolicy,
      dynamicFormRating: {
        enabled: true,
        initializeFrom: 'BASELINE',
        ratingsPolicy: constantK,
        ratingsPolicyName: NHL,
      },
    },
  };
  expect(formRatingsPolicy(stored)).toEqual({ policy: constantK, referenced: true });
});

it('a competition policy is attached as given', () => {
  mocksEngine.generateTournamentRecord({ setState: true });
  const policyDefinitions = POLICY_COMPETITION_STANDARD;
  expect(tournamentEngine.attachPolicies({ policyDefinitions }).success).toEqual(true);
  const { appliedPolicies } = tournamentEngine.getAppliedPolicies();
  expect(appliedPolicies[POLICY_TYPE_COMPETITION]).toEqual(POLICY_COMPETITION_STANDARD[POLICY_TYPE_COMPETITION]);
});
