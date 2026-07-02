import {
  getTournamentInconsistencies,
  PARTICIPANT_IDENTITY_DUPLICATION,
} from '@Query/tournaments/getTournamentInconsistencies';
import { getEventInconsistencies, EVENT_PARTICIPANT_TYPE_MISMATCH } from '@Query/event/getEventInconsistencies';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Tests/engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

import { DOUBLES_EVENT, SINGLES_EVENT } from '@Constants/eventConstants';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

test('a completed multi-event tournament reports zero inconsistencies at every layer', () => {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawId: 'd-singles', drawSize: 16, drawType: SINGLE_ELIMINATION, eventType: SINGLES_EVENT },
      { drawId: 'd-doubles', drawSize: 8, drawType: SINGLE_ELIMINATION, eventType: DOUBLES_EVENT },
    ],
    completeAllMatchUps: true,
    setState: true,
  });
  const result: any = tournamentEngine.getTournamentInconsistencies();
  expect(result.inconsistencies).toEqual([]);
  expect(result.valid).toEqual(true);
});

test('detects participants whose type is inconsistent with the eventType', () => {
  setSubscriptions({});
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: 'd1', drawSize: 8, drawType: SINGLE_ELIMINATION, eventType: DOUBLES_EVENT }],
  });
  const event = tournamentRecord.events[0];

  // baseline: a DOUBLES event with PAIR participants is coherent
  expect(getEventInconsistencies({ event, tournamentRecord }).valid).toEqual(true);

  // corrupt: relabel the event SINGLES — its PAIR participants are now inconsistent with eventType
  event.eventType = SINGLES_EVENT;
  const result: any = getEventInconsistencies({ event, tournamentRecord });
  expect(result.valid).toEqual(false);
  const mismatch = result.inconsistencies.find((i) => i.issueType === EVENT_PARTICIPANT_TYPE_MISMATCH);
  expect(mismatch).toBeTruthy();
  expect(mismatch.participantType).toEqual('PAIR');
  expect(mismatch.severity).toEqual('error');
  expect(mismatch.scope).toEqual('EVENT');
  expect(mismatch.eventId).toEqual(event.eventId);
});

test('fans out draw + structure inconsistencies with eventId stamped', () => {
  setSubscriptions({});
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: 'fe', drawSize: 8, drawType: SINGLE_ELIMINATION, eventType: SINGLES_EVENT }],
    completeAllMatchUps: true,
  });
  const event = tournamentRecord.events[0];
  const structure = event.drawDefinitions[0].structures[0];
  const r1 = structure.matchUps.find((m) => m.roundNumber === 1 && m.roundPosition === 1 && m.winningSide);
  r1.winningSide = r1.winningSide === 1 ? 2 : 1;

  const result: any = getEventInconsistencies({ event, tournamentRecord });
  const bubbled = result.inconsistencies.find((i) => i.matchUpId === r1.matchUpId);
  expect(bubbled).toBeTruthy();
  expect(bubbled.scope).toEqual('STRUCTURE');
  expect(bubbled.eventId).toEqual(event.eventId);
  expect(bubbled.drawId).toEqual('fe');
});

test('detects a person represented by two distinct INDIVIDUAL participants', () => {
  setSubscriptions({});
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: 'idup', drawSize: 8, drawType: SINGLE_ELIMINATION, eventType: SINGLES_EVENT }],
    completeAllMatchUps: true,
  });
  expect(getTournamentInconsistencies({ tournamentRecord }).valid).toEqual(true);

  // corrupt: clone an existing INDIVIDUAL participant under a new participantId but the same personId
  const original = tournamentRecord.participants.find((p) => p.participantType === 'INDIVIDUAL' && p.person?.personId);
  tournamentRecord.participants.push({
    ...original,
    participantId: `${original.participantId}-dup`,
  });

  const result: any = getTournamentInconsistencies({ tournamentRecord });
  const dup = result.inconsistencies.find((i) => i.issueType === PARTICIPANT_IDENTITY_DUPLICATION);
  expect(dup).toBeTruthy();
  expect(dup.personId).toEqual(original.person.personId);
  expect(dup.participantIds).toContain(`${original.participantId}-dup`);
  expect(dup.severity).toEqual('warning');
  expect(dup.scope).toEqual('TOURNAMENT');
  expect(typeof dup.fingerprint).toEqual('string');
});
