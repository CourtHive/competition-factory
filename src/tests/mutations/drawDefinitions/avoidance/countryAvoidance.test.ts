import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { allDrawMatchUps } from '@Query/matchUps/getAllDrawMatchUps';
import { avoidanceTest } from './avoidanceTest';
import { eventConstants } from '../../../..';
import { expect, it } from 'vitest';

// constants
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
const { SINGLES, DOUBLES } = eventConstants;

const avoidancePolicy = {
  roundsToSeparate: undefined,
  policyName: 'Nationality Code',
  policyAttributes: [{ key: 'person.nationalityCode' }, { key: 'individualParticipants.person.nationalityCode' }],
};

it('can generate SINGLE_ELIMINATION drawDefinition using country avoidance with PAIR participants', () => {
  let { conflicts, error } = avoidanceTest({
    avoidance: avoidancePolicy,
    participantType: PAIR,
    eventType: DOUBLES,
    sex: 'MALE',
  });
  if (error) console.log({ error });
  if (conflicts?.unseededConflicts) {
    console.log(conflicts);
  }

  ({ conflicts, error } = avoidanceTest({
    avoidance: avoidancePolicy,
    participantType: PAIR,
    eventType: DOUBLES,
    sex: 'FEMALE',
  }));
  if (error) console.log({ error });
  if (conflicts?.unseededConflicts) {
    console.log(conflicts.unseededConflicts);
  }
});

it('can generate SINGLE_ELIMINATION drawDefinition using country avoidance with INDIVIDUAL participants', () => {
  let { conflicts, error } = avoidanceTest({
    eventType: SINGLES,
    participantType: INDIVIDUAL,
    avoidance: avoidancePolicy,
  });
  if (error) console.log({ error });
  if (conflicts?.unseededConflicts) console.log(conflicts.unseededConflicts);

  ({ conflicts, error } = avoidanceTest({
    eventType: SINGLES,
    participantType: INDIVIDUAL,
    avoidance: avoidancePolicy,
    valuesCount: 4,
  }));
  if (error) console.log({ error });
  if (conflicts?.unseededConflicts) console.log(conflicts.unseededConflicts);
});

it('can generate SINGLE_ELIMINATION drawDefinition using country avoidance with INDIVIDUAL participants and BYEs', () => {
  let { conflicts, error } = avoidanceTest({
    eventType: SINGLES,
    participantsCount: 17,
    participantType: INDIVIDUAL,
    avoidance: avoidancePolicy,
  });
  if (error) console.log({ error });
  if (conflicts?.unseededConflicts) console.log(conflicts.unseededConflicts);

  ({ conflicts, error } = avoidanceTest({
    eventType: SINGLES,
    participantsCount: 17,
    participantType: INDIVIDUAL,
    avoidance: avoidancePolicy,
    valuesCount: 4,
  }));
  if (error) console.log({ error });
  if (conflicts?.unseededConflicts) console.log(conflicts.unseededConflicts);

  ({ conflicts, error } = avoidanceTest({
    eventType: SINGLES,
    participantsCount: 23,
    participantType: INDIVIDUAL,
    avoidance: avoidancePolicy,
    valuesCount: 4,
  }));
  if (error) console.log({ error });
  if (conflicts?.unseededConflicts) console.log(conflicts.unseededConflicts);

  ({ conflicts, error } = avoidanceTest({
    eventType: SINGLES,
    participantsCount: 27,
    participantType: INDIVIDUAL,
    avoidance: avoidancePolicy,
    valuesCount: 4,
  }));
  if (error) console.log({ error });
  if (conflicts?.unseededConflicts) console.log(conflicts.unseededConflicts);

  ({ conflicts, error } = avoidanceTest({
    eventType: SINGLES,
    participantsCount: 17,
    participantType: INDIVIDUAL,
    avoidance: avoidancePolicy,
    valuesCount: 4,
  }));
  if (error) console.log({ error });
  if (conflicts?.unseededConflicts) console.log(conflicts.unseededConflicts);
});

it('can generate ROUND_ROBIN drawDefinition using country avoidance with INDIVIDUAL participants', () => {
  const { conflicts, error, drawDefinition } = avoidanceTest({
    participantType: INDIVIDUAL,
    avoidance: avoidancePolicy,
    valuesInstanceLimit: 4,
    drawType: ROUND_ROBIN,
    participantsCount: 32,
    eventType: SINGLES,
    valuesCount: 8,
  });
  if (error) console.log({ error });
  if (conflicts?.unseededConflicts) console.log('RR conflicts:', conflicts?.unseededConflicts);

  const matchUps = allDrawMatchUps({ drawDefinition }).matchUps;
  expect(matchUps?.length).toEqual(48);
  const structure = drawDefinition.structures[0];
  const { positionAssignments } = getPositionAssignments({ structure });
  const assignedPositions = positionAssignments?.filter(({ participantId }) => participantId);
  expect(assignedPositions?.length).toEqual(32);
});
