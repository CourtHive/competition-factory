/**
 * One tournament that exercises every participant type a privacy policy has to govern.
 *
 * INDIVIDUAL (seeded singles), PAIR (doubles), TEAM (team event) and GROUP all appear, individuals
 * belong to teams/pairs/groups so `withGroupings` produces `teams` / `groups` attributes, a staff
 * participant exists so `tournamentContacts` is non-empty, and order of play is published so the
 * schedule surface returns matchUps rather than an empty shell.
 *
 * Persons are saturated (see `privacySaturation.ts`) so every attribute the policy denies actually
 * holds a value — an absence assertion against an attribute that was never populated is vacuous.
 */

import { saturateParticipants } from './privacySaturation';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';

// constants and types
import { DOUBLES, SINGLES, TEAM } from '@Constants/eventConstants';
import { GROUP, INDIVIDUAL } from '@Constants/participantConstants';
import { COMPETITOR, OFFICIAL, OTHER } from '@Constants/participantRoles';

export const SINGLES_DRAW_ID = 'privacy-singles-draw';
export const DOUBLES_DRAW_ID = 'privacy-doubles-draw';
export const TEAM_DRAW_ID = 'privacy-team-draw';
export const GROUP_PARTICIPANT_ID = 'privacy-group-participant';
export const STAFF_PARTICIPANT_ID = 'privacy-staff-official';

const VENUE_ID = 'e8e4c0b0-216c-426f-bba2-18e16caa74b8';
const START_DATE = '2024-01-01';

export function generatePrivacyFixture() {
  const venueProfiles = [
    {
      venueId: VENUE_ID,
      venueName: 'Club Courts',
      venueAbbreviation: 'CC',
      startTime: '08:00',
      endTime: '20:00',
      courtsCount: 8,
    },
  ];

  const schedulingProfile = [
    {
      scheduleDate: START_DATE,
      venues: [
        {
          venueId: VENUE_ID,
          rounds: [
            { drawId: SINGLES_DRAW_ID, roundNumber: 1 },
            { drawId: SINGLES_DRAW_ID, roundNumber: 2 },
            { drawId: DOUBLES_DRAW_ID, roundNumber: 1 },
          ],
        },
      ],
    },
  ];

  const { tournamentRecord, eventIds, drawIds } = mocksEngine.generateTournamentRecord({
    // `withScaleValues` + a rating category are what make `rankings` / `ratings` / `seedings` real:
    // they are computed during hydration, so without them a policy that denies them has nothing to
    // deny and the assertion is vacuous.
    participantsProfile: {
      addressProps: { citiesCount: 5, statesCount: 3, postalCodesCount: 5 },
      category: { categoryName: 'U18' },
      scaledParticipantsCount: 8,
      rankingRange: [1, 20],
      withScaleValues: true,
    },
    drawProfiles: [
      {
        category: { ratingType: 'WTN', ratingMin: 14, ratingMax: 19.99 },
        drawId: SINGLES_DRAW_ID,
        eventType: SINGLES,
        drawName: 'Singles',
        seedsCount: 4,
        drawSize: 8,
      },
      { drawSize: 8, seedsCount: 4, eventType: DOUBLES, drawId: DOUBLES_DRAW_ID, drawName: 'Doubles' },
      { drawSize: 4, eventType: TEAM, drawId: TEAM_DRAW_ID, drawName: 'Team' },
    ],
    scheduleCompletedMatchUps: true,
    schedulingProfile,
    venueProfiles,
    endDate: '2024-01-03',
    startDate: START_DATE,
    nonRandom: 1,
  });

  const individualParticipantIds = (tournamentRecord.participants ?? [])
    .filter((participant: any) => participant.participantType === INDIVIDUAL)
    .slice(0, 3)
    .map((participant: any) => participant.participantId);

  tournamentRecord.participants.push(
    {
      individualParticipantIds,
      participantId: GROUP_PARTICIPANT_ID,
      participantName: 'Squad One',
      participantRole: OTHER,
      participantType: GROUP,
    } as any,
    {
      participantId: STAFF_PARTICIPANT_ID,
      participantName: 'Official Person',
      participantRole: OFFICIAL,
      participantType: INDIVIDUAL,
      person: {
        personId: 'privacy-staff-person',
        standardFamilyName: 'Official',
        standardGivenName: 'Person',
        nationalityCode: 'GBR',
        sex: 'FEMALE',
      },
    } as any,
  );

  const { saturatedCount } = saturateParticipants({ tournamentRecord });

  tournamentEngine.setState(tournamentRecord);
  // Scheduled explicitly rather than via a mocksEngine flag: `getParticipantSchedules` keeps only
  // matchUps that carry a `schedule`, so without this it returns an empty array and every assertion
  // about it is vacuous — which is exactly the failure mode this suite exists to prevent.
  tournamentEngine.scheduleProfileRounds({ scheduleDates: [START_DATE] });
  tournamentEngine.publishOrderOfPlay();
  for (const eventId of eventIds) tournamentEngine.publishEvent({ eventId });

  // The reference emission: every participant, fully hydrated, with NO policy applied. This — rather
  // than the stored record — is what the conformance checks diff against, because it is the only place
  // COMPUTED attributes exist. `rankings`, `ratings`, `seedings`, `teams` and `groups` are derived
  // during hydration and appear nowhere on the record, so a check anchored to the record could neither
  // prove a policy denying them was honoured nor notice one that was not.
  const hydratedParticipants = tournamentEngine.getParticipants({
    withIndividualParticipants: true,
    withScaleValues: true,
    withGroupings: true,
  }).participants;

  return {
    participants: tournamentEngine.getTournament().tournamentRecord.participants,
    hydratedParticipants,
    individualParticipantIds,
    tournamentRecord,
    saturatedCount,
    eventIds,
    drawIds,
    venueId: VENUE_ID,
    competitorRole: COMPETITOR,
  };
}
