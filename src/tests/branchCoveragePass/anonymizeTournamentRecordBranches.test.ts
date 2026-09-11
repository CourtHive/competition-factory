import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// constants
import { INDIVIDUAL, PAIR } from '@Constants/participantConstants';
import { FEMALE, MALE, OTHER } from '@Constants/genderConstants';

// A near-empty record exercises every `?? []` nullish guard: participants,
// venues, and events are all undefined, and startDate is absent so the
// `startDate || formatDate(new Date())` fallback runs. This drives the
// nullish side of the participant loops (118/127/266), the events loop (221),
// the grouped-participant filters (407/411/423/431), the consideredDate
// fallback (264), and buildAddressValues with zero individuals so the
// `count || individualParticipantsCount` fallbacks (337/341/345) hit 0.
test('anonymize a near-empty record drives every nullish array guard', () => {
  const tournamentRecord: any = { tournamentId: 'anon-empty-1' };

  let result: any = mocksEngine.anonymizeTournamentRecord({ tournamentRecord });
  expect(result.success).toEqual(true);
  // tournamentId was replaced with a generated UUID
  expect(tournamentRecord.tournamentId).not.toEqual('anon-empty-1');
});

// A venue with no `courts` array drives the nullish side of the court loop (153).
test('anonymize a venue with no courts drives the court-loop nullish guard', () => {
  const tournamentRecord: any = {
    tournamentId: 'anon-venue-1',
    venues: [{ venueId: 'v1', venueName: 'Real Venue' }],
  };

  let result: any = mocksEngine.anonymizeTournamentRecord({ tournamentRecord });
  expect(result.success).toEqual(true);
  expect(tournamentRecord.venues[0].venueName).toEqual('Venue #0');
  expect(tournamentRecord.venues[0].isMock).toEqual(true);
});

// Hand-crafted event/draw structures drive the defensive draw branches:
//  - event.entries not an array → 233 false
//  - drawDefinition.entries not an array → 170 false
//  - positionAssignment / seedAssignment without participantId → 183/187 false
//  - a structure with no seedAssignments → 186 nullish
//  - a matchUp side with no lineUp → the `continue` guard (194)
//  - drawDefinition.links present → 213 true side
//  - a second drawDefinition with no structures → 203 nullish
//  - a second event with no drawDefinitions → 239 nullish
//  - flightProfile flight with no drawEntries array → 79 false
test('anonymize hand-crafted events drives the defensive draw/structure guards', () => {
  const tournamentRecord: any = {
    tournamentId: 'anon-draw-1',
    events: [
      {
        eventId: 'e1',
        // no entries array → 233 false
        flightProfile: { flights: [{ flightNumber: 1, drawId: 'd1' }] }, // no drawEntries → 79 false
        drawDefinitions: [
          {
            drawId: 'd1',
            // no entries array → 170 false
            structures: [
              {
                structureId: 's1',
                positionAssignments: [{ drawPosition: 1 }], // no participantId → 183 false
                seedAssignments: [{ seedNumber: 1 }], // no participantId → 187 false
                matchUps: [{ matchUpId: 'm1', sides: [{ sideNumber: 1 }] }], // no lineUp → continue (194)
              },
              {
                structureId: 's2', // no seedAssignments / positionAssignments → 186 nullish
              },
            ],
            links: [{ source: { structureId: 's1' }, target: { structureId: 's2' } }], // 213 true
          },
          {
            drawId: 'd2', // no structures → 203 nullish
          },
        ],
      },
      {
        eventId: 'e2', // no drawDefinitions → 239 nullish
      },
    ],
  };

  let result: any = mocksEngine.anonymizeTournamentRecord({ tournamentRecord });
  expect(result.success).toEqual(true);
  expect(tournamentRecord.events[0].isMock).toEqual(true);
  // link structureIds were remapped through idMap
  expect(tournamentRecord.events[0].drawDefinitions[0].links[0].source.structureId).not.toEqual('s1');
});

// Individual persons with and without addresses, and shared address components,
// drive:
//  - person with addresses vs person without addresses → 377 true/false + 322
//  - duplicate city/state/postalCode across participants → 324/325/326 skip-push
//  - non-gendered (OTHER) sex counter branch
test('anonymize individuals drives address de-dup and the no-address guard', () => {
  const tournamentRecord: any = {
    tournamentId: 'anon-people-1',
    startDate: '2026-05-01',
    participants: [
      {
        participantId: 'p1',
        participantType: INDIVIDUAL,
        person: {
          personId: 'pe1',
          sex: MALE,
          standardFamilyName: 'Alpha',
          standardGivenName: 'Aaron',
          addresses: [{ city: 'SharedCity', state: 'SharedState', postalCode: '00001' }],
        },
      },
      {
        participantId: 'p2',
        participantType: INDIVIDUAL,
        person: {
          personId: 'pe2',
          sex: FEMALE,
          standardFamilyName: 'Beta',
          standardGivenName: 'Bella',
          // identical address components → 324/325/326 includes() true → skip push
          addresses: [{ city: 'SharedCity', state: 'SharedState', postalCode: '00001' }],
        },
      },
      {
        participantId: 'p3',
        participantType: INDIVIDUAL,
        // no addresses → 377 false and 322 `?? {}` fallback
        person: { personId: 'pe3', sex: OTHER, standardFamilyName: 'Gamma', standardGivenName: 'Grace' },
      },
    ],
  };

  let result: any = mocksEngine.anonymizeTournamentRecord({ tournamentRecord });
  expect(result.success).toEqual(true);

  const anon = tournamentRecord.participants.filter((p: any) => p.participantType === INDIVIDUAL);
  // the addressed participants received a generated address; p3 did not
  expect(anon[0].person.addresses?.length).toEqual(1);
  expect(anon[2].person.addresses).toBeUndefined();
});

// A PAIR referencing two individuals plus a PAIR referencing a single
// individual drives generatePairParticipantName:
//  - length === 1 → 477 appends '/Unknown'
//  - standardFamilyName present → 472 first `||` left side
test('anonymize pair names drives the single-member and family-name branches', () => {
  const tournamentRecord: any = {
    tournamentId: 'anon-pair-1',
    participants: [
      {
        participantId: 'p1',
        participantType: INDIVIDUAL,
        person: { personId: 'pe1', sex: MALE, standardFamilyName: 'Alpha', standardGivenName: 'Aaron' },
      },
      {
        participantId: 'p2',
        participantType: INDIVIDUAL,
        person: { personId: 'pe2', sex: FEMALE, standardFamilyName: 'Beta', standardGivenName: 'Bella' },
      },
      { participantId: 'pairTwo', participantType: PAIR, individualParticipantIds: ['p1', 'p2'] },
      { participantId: 'pairOne', participantType: PAIR, individualParticipantIds: ['p1'] },
    ],
  };

  let result: any = mocksEngine.anonymizeTournamentRecord({ tournamentRecord });
  expect(result.success).toEqual(true);

  const pairs = tournamentRecord.participants.filter((p: any) => p.participantType === PAIR);
  const singleMemberPair = pairs.find((p: any) => p.individualParticipantIds.length === 1);
  expect(singleMemberPair.participantName.endsWith('/Unknown')).toEqual(true);
});

// With anonymizeParticipantNames:false and individuals lacking a
// standardFamilyName, generatePairParticipantName falls through the `||`
// chain to participantOtherName then participantName (472 fallbacks).
test('anonymize pair names falls through to otherName / participantName', () => {
  const tournamentRecord: any = {
    tournamentId: 'anon-pair-2',
    participants: [
      {
        participantId: 'ip1',
        participantType: INDIVIDUAL,
        participantOtherName: 'FallbackOther',
        // no standardFamilyName → generatedPerson keeps undefined under names:false
        person: { personId: 'x1', sex: MALE },
      },
      {
        participantId: 'ip2',
        participantType: INDIVIDUAL,
        participantName: 'FallbackName',
        person: { personId: 'x2', sex: FEMALE },
      },
      { participantId: 'pairFallback', participantType: PAIR, individualParticipantIds: ['ip1', 'ip2'] },
    ],
  };

  let result: any = mocksEngine.anonymizeTournamentRecord({
    anonymizeParticipantNames: false,
    tournamentRecord,
  });
  expect(result.success).toEqual(true);

  const pair = tournamentRecord.participants.find((p: any) => p.participantType === PAIR);
  expect(pair.participantName.includes('FallbackOther')).toEqual(true);
  expect(pair.participantName.includes('FallbackName')).toEqual(true);
});

// keepExtensions passed as a non-array (e.g. `true`) drives the else branch of
// the filterExtensions Array.isArray guard, preserving extensions verbatim.
test('anonymize with non-array keepExtensions preserves extensions', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });
  tournamentRecord.extensions = tournamentRecord.extensions ?? [];
  tournamentRecord.extensions.push({ name: 'customExt', value: { keep: true } });

  let result: any = mocksEngine.anonymizeTournamentRecord({
    keepExtensions: true,
    tournamentRecord,
  });
  expect(result.success).toEqual(true);
  const kept = tournamentRecord.extensions.find((e: any) => e.name === 'customExt');
  expect(kept).toBeDefined();
});
