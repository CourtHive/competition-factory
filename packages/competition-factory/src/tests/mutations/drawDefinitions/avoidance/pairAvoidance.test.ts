import { avoidanceTest } from './avoidanceTest';
import { intersection } from '@Tools/arrays';
import { expect, it } from 'vitest';

import { PAIR } from '@Constants/participantConstants';
import { eventConstants } from '../../../..';

const { SINGLES } = eventConstants;

const pairAvoidancePolicy = {
  policyAttributes: [{ directive: 'pairParticipants' }],
  policyName: 'Doubles Partner Avoidance',
  roundsToSeparate: undefined,
  candidatesCount: 20,
};

it('can generate SINGLE_ELIMINATION drawDefinition using pair avoidance with Doubles participants', () => {
  const result = avoidanceTest({
    avoidance: pairAvoidancePolicy,
    participantType: PAIR,
    participantsCount: 16,
    eventType: SINGLES,
  });
  const { conflicts, report, participants } = result || {};
  const pairedParticipants = participants
    .filter((p) => p.participantType === PAIR)
    .map((p) => p.individualParticipants.map((ip) => ip.participantName));
  const pairedOpponents = report.map((r) => r.names);
  pairedParticipants.forEach((pair) => {
    pairedOpponents.forEach((opponents) => {
      const overlap = intersection(pair, opponents);
      expect(overlap.length).toBeLessThan(2);
    });
  });
  if (conflicts?.unseededConflicts) console.log(conflicts);
});

it('can generate SINGLE_ELIMINATION drawDefinition using pair avoidance with Doubles participants and seeding', () => {
  const result = avoidanceTest({
    seedsCount: 4,
    eventType: SINGLES,
    participantType: PAIR,
    participantsCount: 16,
    avoidance: pairAvoidancePolicy,
  });
  const { conflicts, report, participants } = result || {};
  const pairedParticipants = participants
    .filter((p) => p.participantType === PAIR)
    .map((p) => p.individualParticipants.map((ip) => ip.participantName));
  const pairedOpponents = report.map((r) => r.names);
  pairedParticipants.forEach((pair) => {
    pairedOpponents.forEach((opponents) => {
      const overlap = intersection(pair, opponents);
      if (overlap.length > 1) console.log({ pair, opponents, overlap });
    });
  });
  if (conflicts?.unseededConflicts) console.log(conflicts);
});

it('can generate SINGLE_ELIMINATION drawDefinition using pair and nationality avoidance with Doubles participants and seeding', () => {
  const pairAvoidancePolicy = {
    roundsToSeparate: undefined,
    policyName: 'Doubles Partner Avoidance',
    policyAttributes: [
      { key: 'person.nationalityCode' },
      { key: 'individualParticipants.person.nationalityCode' },
      { directive: 'pairParticipants' },
    ],
  };

  const result = avoidanceTest({
    seedsCount: 4,
    eventType: SINGLES,
    participantType: PAIR,
    participantsCount: 16,
    avoidance: pairAvoidancePolicy,
  });
  const { conflicts, report, participants } = result || {};
  const pairedParticipants = participants
    .filter((p) => p.participantType === PAIR)
    .map((p) => p.individualParticipants.map((ip) => ip.participantName));
  const pairedOpponents = report.map((r) => r.names);
  pairedParticipants.forEach((pair) => {
    pairedOpponents.forEach((opponents) => {
      const overlap = intersection(pair, opponents);
      if (overlap.length > 1) console.log({ pair, opponents, overlap });
    });
  });
  if (conflicts?.unseededConflicts) console.log(conflicts);
});
