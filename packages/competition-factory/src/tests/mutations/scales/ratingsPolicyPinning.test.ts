import { POLICY_RATINGS_ELO_538_NHL } from '@Fixtures/policies/POLICY_RATINGS_ELO_538_NHL';
import { formRatingsPolicy } from '@Helpers/ratings/competition/formRatingsPolicy';
import { pinnedCompetitionFormat } from '@Helpers/ratings/pinnedCompetitionFormat';
import { ratingsPolicies } from '@Fixtures/policies/ratingsPolicies';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import scaleEngine from '@Engines/scaleEngine';

// constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_RATINGS } from '@Constants/policyConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';

// A competitionFormat that names a ratings preset is stored with the preset's full policy when it is attached, so a
// stored record never needs the name looked up when it is read. The name stays as `ratingsPolicyName`, a label.

const NHL = 'POLICY_RATINGS_ELO_538_NHL';
const NHL_POLICY = POLICY_RATINGS_ELO_538_NHL[POLICY_TYPE_RATINGS];
const HOCKEY = 'PER3XA-S:T20P-O:1SD/T5P-F:SO5';
const regulationWin = [
  { setNumber: 1, side1Score: 2, side2Score: 0 },
  { setNumber: 2, side1Score: 1, side2Score: 1 },
  { setNumber: 3, side1Score: 1, side2Score: 0 },
];

beforeEach(() => {
  // the deprecation warning for the preset name is covered in catalogueNameWarnings.test.ts
  vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
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

function storedFormat(eventId: string) {
  return tournamentEngine.getEvent({ eventId }).event.competitionFormat;
}

it('modifyEvent stores the full policy of a preset it is given by name, keeping the name as a label', () => {
  const { eventId } = hockeyDraw();
  const competitionFormat = { sport: 'OTHER', ratingsPolicy: NHL };
  expect(tournamentEngine.modifyEvent({ eventId, eventUpdates: { competitionFormat } }).success).toEqual(true);

  const stored = storedFormat(eventId);
  expect(stored).toEqual({ sport: 'OTHER', ratingsPolicy: NHL_POLICY, ratingsPolicyName: NHL });
  // the caller's object is not changed, and the stored policy is a copy, not the catalogue's preset
  expect(competitionFormat.ratingsPolicy).toEqual(NHL);
  const pinned = pinnedCompetitionFormat({ ratingsPolicy: NHL });
  expect(pinned.ratingsPolicy).toEqual(ratingsPolicies[NHL]);
  expect(pinned.ratingsPolicy).not.toBe(ratingsPolicies[NHL]);
});

it('addEvent stores the full policy of a preset its competitionFormat names', () => {
  mocksEngine.generateTournamentRecord({ setState: true });
  const event = { eventType: SINGLES_EVENT, competitionFormat: { ratingsPolicy: NHL } };
  const { event: added }: any = tournamentEngine.addEvent({ event });
  expect(storedFormat(added.eventId)).toEqual({ ratingsPolicy: NHL_POLICY, ratingsPolicyName: NHL });
  expect(event.competitionFormat.ratingsPolicy).toEqual(NHL);
});

it('an inline policy, and a competitionFormat with none, are stored as given', () => {
  const { eventId } = hockeyDraw();
  const competitionFormat = { ratingsPolicy: NHL_POLICY };
  tournamentEngine.modifyEvent({ eventId, eventUpdates: { competitionFormat } });
  expect(storedFormat(eventId)).toEqual({ ratingsPolicy: NHL_POLICY });
  tournamentEngine.modifyEvent({ eventId, eventUpdates: { competitionFormat: { sport: 'OTHER' } } });
  expect(storedFormat(eventId)).toEqual({ sport: 'OTHER' });
});

it('a stored policy rates without the catalogue', () => {
  const { eventId, matchUpId } = hockeyDraw();
  tournamentEngine.modifyEvent({ eventId, eventUpdates: { competitionFormat: { ratingsPolicy: NHL } } });

  // the preset is gone from the catalogue, as it is in 8.0.0: the stored record still rates by the NHL policy
  const preset = ratingsPolicies[NHL];
  delete ratingsPolicies[NHL];
  try {
    expect(rate(matchUpId).values).toEqual([1505, 1495]);
  } finally {
    ratingsPolicies[NHL] = preset;
  }
});

it('a record holding only a preset name still rates by the preset', () => {
  const { eventId, matchUpId } = hockeyDraw();
  // written directly, as a record stored before presets were pinned holds it
  const { tournamentRecord } = tournamentEngine.getTournament();
  tournamentRecord.events.find((event) => event.eventId === eventId).competitionFormat = { ratingsPolicy: NHL };
  tournamentEngine.setState(tournamentRecord);
  expect(rate(matchUpId).values).toEqual([1505, 1495]);
});

it('a preset name the factory does not hold is refused by name when rating', () => {
  const { eventId, matchUpId } = hockeyDraw();
  // attaching it stores the name as given, as before
  const competitionFormat = { ratingsPolicy: 'POLICY_RATINGS_NONE' };
  expect(tournamentEngine.modifyEvent({ eventId, eventUpdates: { competitionFormat } }).success).toEqual(true);
  expect(storedFormat(eventId)).toEqual(competitionFormat);

  const { result, values } = rate(matchUpId);
  expect(result.error).toEqual(INVALID_VALUES);
  expect(result.info).toEqual(
    `ratingsPolicy: no ratings preset named 'POLICY_RATINGS_NONE' (matchUp ${matchUpId}); pass the ratings policy object`,
  );
  expect(result.context).toEqual({ ratingsPolicy: 'POLICY_RATINGS_NONE', matchUpId });
  expect(values).toEqual([undefined, undefined]);
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

it("a competition policy's form rating names a preset it does not hold in its refusal", () => {
  const competitionPolicy: any = {
    ratingPolicy: { dynamicFormRating: { enabled: true, initializeFrom: 'BASELINE', ratingsPolicy: 'NONE' } },
  };
  expect(formRatingsPolicy(competitionPolicy)).toEqual({
    info: "dynamicFormRating.ratingsPolicy: no ratings preset named 'NONE'; pass the ratings policy object",
    context: { ratingsPolicy: 'NONE' },
    error: INVALID_VALUES,
  });
});
