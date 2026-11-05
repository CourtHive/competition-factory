import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// Constants
import { USTA_GOLD_TEAM_CHALLENGE } from '@Constants/tieFormatConstants';
import { ALTERNATE, UNGROUPED } from '@Constants/entryStatusConstants';
import tieFormatDefaults from '@Helpers/tieFormats/tieFormatDefaults';
import { SINGLES_EVENT, TEAM_EVENT } from '@Constants/eventConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { TEAM_PARTICIPANT } from '@Constants/participantConstants';
import { FEMALE, MALE, MIXED } from '@Constants/genderConstants';

it('can generate singles/doubles events from tieFormats', () => {
  const drawSize = 8;
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 0 }, // required to force generation of tieFormat-specific participants
    drawProfiles: [
      { generate: false, addEvent: false, eventType: TEAM_EVENT, drawSize, tieFormatName: USTA_GOLD_TEAM_CHALLENGE },
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

  result = tournamentEngine.generateEventsFromTieFormat({ tieFormatName: {} });
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.generateEventsFromTieFormat({ tieFormatName: '' });
  expect(result.error).toEqual(INVALID_VALUES);

  const tieFormat = tieFormatDefaults({ namedFormat: USTA_GOLD_TEAM_CHALLENGE });

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

  result = tournamentEngine.generateEventsFromTieFormat({ tieFormatName: USTA_GOLD_TEAM_CHALLENGE });
  expect(result.success).toBe(true);

  events = tournamentEngine.getEvents().events;
  expect(events.length).toBe(5);
});
