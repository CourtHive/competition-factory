import { makeDeepCopy } from '@Tools/makeDeepCopy';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { INVALID_PARTICIPANT_IDS } from '@Constants/errorConditionConstants';
import { FEMALE, MALE } from '@Constants/genderConstants';

const snapshot = () => makeDeepCopy(tournamentEngine.getTournament().tournamentRecord, false, true);

it('addEventEntries refuses a mixed valid/invalid list before writing event or flight entries', () => {
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 16 },
    eventProfiles: [{ eventId: 'e1', gender: MALE, drawProfiles: [{ drawId: 'd1', drawSize: 4, generate: false }] }],
    setState: true,
  });

  const participants = tournamentEngine.getParticipants().participants;
  const event = tournamentEngine.getEvent({ eventId: 'e1' }).event;
  const enteredIds = new Set(event.entries.map((e: any) => e.participantId));
  const male = participants.find((p: any) => p.person?.sex === MALE && !enteredIds.has(p.participantId));
  const female = participants.find((p: any) => p.person?.sex === FEMALE);
  expect(male).toBeDefined();
  expect(female).toBeDefined();

  const before = snapshot();

  let result: any = tournamentEngine.addEventEntries({
    participantIds: [male.participantId, female.participantId],
    drawId: 'd1',
    eventId: 'e1',
  });
  expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);
  expect(snapshot()).toEqual(before);

  // the valid participant alone is still accepted
  result = tournamentEngine.addEventEntries({ participantIds: [male.participantId], eventId: 'e1' });
  expect(result.success).toEqual(true);
});
