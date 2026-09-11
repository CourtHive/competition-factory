import { POLICY_MATCHUP_ACTIONS_DEFAULT } from '@Fixtures/policies/POLICY_MATCHUP_ACTIONS_DEFAULT';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { xa } from '@Tools/extractAttributes';
import { unique } from '@Tools/arrays';
import { expect, it } from 'vitest';

import { INVALID_PARTICIPANT } from '@Constants/errorConditionConstants';
import { USTA_GOLD_TEAM_CHALLENGE } from '@Constants/tieFormatConstants';
import { ASSIGN_PARTICIPANT } from '@Constants/positionActionConstants';
import { SINGLES_MATCHUP, TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { FEMALE, MALE } from '@Constants/genderConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';

it('can enforce collection gender', () => {
  // 1. generate gendered tieFormat
  // 2. matchUpActions return individualParticipants filtered by collection gender
  // 3. errors thrown for attempting to assign inappropriate gender
  // 4. Mixed Doubles will filter on 2nd participant placement (UI modal must filter independently?)

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    // Seed the generator (mocksEngine threads a numeric `nonRandom` into a
    // deterministic PRNG) so the generated team rosters have a fixed gender
    // composition. The assertions below require BOTH genders on side 2 (the
    // opposite-gender slot picked at `side2incorrectGenderedIndividuals[0]`);
    // a purely random roster could rarely leave a side single-gendered, which
    // flaked the suite intermittently on CI (node 24).
    nonRandom: 1,
    drawProfiles: [
      {
        tieFormatName: USTA_GOLD_TEAM_CHALLENGE,
        eventType: TEAM_EVENT,
        drawSize: 2,
      },
    ],
  });
  let result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  // Defensive: tournamentEngine is a singleton, and matchUpActions consults
  // the global matchUpActionsPolicy. setState() resets tournament state but
  // NOT policy state, so an upstream test (e.g. one that disables
  // ASSIGN_PARTICIPANT via attachPolicies) can leak into this test on CI
  // where vitest worker scheduling differs from local. Reattaching the
  // default policy here guarantees `matchUpActions().validActions` contains
  // ASSIGN_PARTICIPANT regardless of suite order.
  tournamentEngine.attachPolicies({ policyDefinitions: POLICY_MATCHUP_ACTIONS_DEFAULT });

  const participants = tournamentEngine.getParticipants({
    withGroupings: true,
  }).participants;
  const individualParticipants = participants.filter(({ participantType }) => participantType === INDIVIDUAL);
  expect(individualParticipants.length).toEqual(16);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const dualMatchUps = matchUps.filter(({ matchUpType }) => matchUpType === TEAM_MATCHUP);
  expect(dualMatchUps.length).toEqual(1);
  const femaleSingles = matchUps.filter(
    ({ matchUpType, gender }) => matchUpType === SINGLES_MATCHUP && gender === FEMALE,
  );
  expect(femaleSingles.length).toEqual(4);
  const maleSingles = matchUps.filter(({ matchUpType, gender }) => matchUpType === SINGLES_MATCHUP && gender === MALE);
  expect(maleSingles.length).toEqual(4);

  const side2team = dualMatchUps[0].sides.find(({ sideNumber }) => sideNumber === 2).participant;
  const side2Individuals = side2team.individualParticipants;

  const testMatchUps = [maleSingles[0], femaleSingles[0]];
  for (const matchUp of testMatchUps) {
    const { matchUpId, drawId } = matchUp;
    const { validActions } = tournamentEngine.matchUpActions({
      sideNumber: 1,
      matchUpId,
      drawId,
    });
    // first ensure that gender is present on hydrated matchUp
    expect([MALE, FEMALE].includes(matchUp.gender)).toBeTruthy();

    const assignPositionAction = validActions.find(({ type }) => type === ASSIGN_PARTICIPANT);
    // should only return participants matching collectionDefinition.gender
    // (look up the action by type rather than positional index — the surrounding
    //  validActions array order is policy-dependent, so [2] is brittle under
    //  unrelated suite-wide policy mutations)
    expect(unique(assignPositionAction.availableParticipants.map((p) => p.person.sex))[0]).toEqual(matchUp.gender);

    const { method, payload, availableParticipantIds } = assignPositionAction;
    let participantId = availableParticipantIds[0];

    result = tournamentEngine[method]({ ...payload, participantId });
    expect(result.success).toEqual(true);

    const side2incorrectGenderedIndividuals = side2Individuals.filter(({ person }) => person.sex !== matchUp.gender);
    participantId = side2incorrectGenderedIndividuals[0].participantId;
    result = tournamentEngine[method]({ ...payload, participantId });
    expect(result.error).toEqual(INVALID_PARTICIPANT);
  }

  const targetMatchUps = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: {
      matchUpIds: testMatchUps.map(xa('matchUpId')),
    },
  }).matchUps;

  // count the number of sides (out of 4) that have participants
  // should only be one assigned side per matchUp => 2
  expect(targetMatchUps.flatMap(xa('sides')).filter(xa('participant')).length).toEqual(2);
});
