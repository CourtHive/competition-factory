import { resolveTieFormat, tieFormatConstants } from '@courthive/competition-catalogue';
import { namedTieFormat } from '@Tests/testHarness/namedTieFormat';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// Constants
import { ALTERNATE, UNGROUPED } from '@Constants/entryStatusConstants';
import { SINGLES_EVENT, TEAM_EVENT } from '@Constants/eventConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { TEAM_PARTICIPANT } from '@Constants/participantConstants';
import { FEMALE, MALE, MIXED } from '@Constants/genderConstants';

const { USTA_GOLD_TEAM_CHALLENGE } = tieFormatConstants;

it('can generate singles/doubles events from tieFormats', () => {
  const drawSize = 8;
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 0 }, // required to force generation of tieFormat-specific participants
    drawProfiles: [
      {
        generate: false,
        addEvent: false,
        eventType: TEAM_EVENT,
        drawSize,
        tieFormat: resolveTieFormat(USTA_GOLD_TEAM_CHALLENGE),
      },
    ],
    setState: true,
  });

  let events = tournamentEngine.getEvents().events;
  expect(events.length).toBe(0);

  const teamParticipants = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [TEAM_PARTICIPANT] },
    withIndividualParticipants: true,
  }).participants;
  expect(teamParticipants.length).toBe(drawSize);
  teamParticipants.forEach((teamParticipant) => {
    expect(teamParticipant.individualParticipantIds.length).toEqual(8);
    const genders = teamParticipant.individualParticipants.map((p) => p.person?.sex);
    expect(genders).toEqual([FEMALE, FEMALE, FEMALE, FEMALE, MALE, MALE, MALE, MALE]);
  });

  let result = tournamentEngine.generateEventsFromTieFormat();
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.generateEventsFromTieFormat({ tieFormat: {} });
  expect(result.error).toEqual(INVALID_VALUES);

  const tieFormat = namedTieFormat(USTA_GOLD_TEAM_CHALLENGE);

  const entryStatus = ALTERNATE;
  result = tournamentEngine.generateEventsFromTieFormat({
    addEntriesFromTeams: true,
    addEvents: false,
    entryStatus,
    tieFormat,
  });
  expect(result.events.length).toBe(5);
  expect(result.success).toBe(true);
  for (const event of result.events) {
    if (event.gender === MIXED) {
      // 64 entries because 8 teams with 8 individualParticipants each = 64, all INDIVIDUALS are UNGROUPED
      expect(event.entries.length).toBe(64);
    } else {
      // 32 entries in SINGLES because 8 teams with 4 gendered individualParticipants each = 32
      // 32 entries in DOUBLES because 8 teams with 4 gendered individualParticipants each = 32, all INDIVIDUALS are UNGROUPED
      expect(event.entries.length).toBe(32);
    }

    if (event.eventType === SINGLES_EVENT) {
      expect(event.entries.every((entry) => entry.entryStatus === entryStatus)).toBe(true);
    } else {
      expect(event.entries.every((entry) => entry.entryStatus === UNGROUPED)).toBe(true);
    }
  }

  events = tournamentEngine.getEvents().events;
  expect(events.length).toBe(0);

  result = tournamentEngine.generateEventsFromTieFormat({ tieFormat: namedTieFormat(USTA_GOLD_TEAM_CHALLENGE) });
  expect(result.success).toBe(true);

  events = tournamentEngine.getEvents().events;
  expect(events.length).toBe(5);
});

it('refuses a tieFormatName without a tieFormat: the factory resolves no names', () => {
  mocksEngine.generateTournamentRecord({ setState: true });
  const eventsBefore = tournamentEngine.getEvents().events.length;

  for (const tieFormatName of [USTA_GOLD_TEAM_CHALLENGE, 'NOT_A_TIE_FORMAT']) {
    const result: any = tournamentEngine.generateEventsFromTieFormat({ tieFormatName } as any);
    expect(result.error).toEqual(INVALID_VALUES);
  }
  expect(tournamentEngine.getEvents().events.length).toEqual(eventsBefore);
});
