import { extractEventInfo, getEventMatchUpFormats } from '@Query/event/extractEventInfo';
import tournamentEngine from '@Engines/syncEngine';
import { mocksEngine } from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// A live tournament surveyed while this was written declared no format on the
// event and this code on its drawDefinition — the shape the survey exists for.
const DRAW_FORMAT = 'SET3-S:6/TB7';
const STRUCTURE_FORMAT = 'SET3-S:6/TB7-F:TB10';
const EVENT_FORMAT = 'SET5-S:6/TB7';
// Pickleball: a rally-scored code, which is how a scoring code identifies sport.
const RALLY_FORMAT = 'SET3-S:11@RALLY';

describe('getEventMatchUpFormats', () => {
  it('surveys the event, its drawDefinitions, and their structures', () => {
    const event: any = {
      matchUpFormat: EVENT_FORMAT,
      drawDefinitions: [{ matchUpFormat: DRAW_FORMAT, structures: [{ matchUpFormat: STRUCTURE_FORMAT }] }],
    };
    expect(getEventMatchUpFormats(event)).toEqual([EVENT_FORMAT, DRAW_FORMAT, STRUCTURE_FORMAT]);
  });

  it('finds a drawDefinition format when the event declares none', () => {
    const event: any = { drawDefinitions: [{ matchUpFormat: DRAW_FORMAT }] };
    expect(getEventMatchUpFormats(event)).toEqual([DRAW_FORMAT]);
  });

  it('recurses into nested structures, as round-robin item structures nest', () => {
    const event: any = {
      drawDefinitions: [{ structures: [{ structures: [{ matchUpFormat: STRUCTURE_FORMAT }] }] }],
    };
    expect(getEventMatchUpFormats(event)).toEqual([STRUCTURE_FORMAT]);
  });

  it('deduplicates codes repeated across draws and structures', () => {
    const event: any = {
      matchUpFormat: DRAW_FORMAT,
      drawDefinitions: [
        { matchUpFormat: DRAW_FORMAT, structures: [{ matchUpFormat: DRAW_FORMAT }] },
        { matchUpFormat: DRAW_FORMAT },
      ],
    };
    expect(getEventMatchUpFormats(event)).toEqual([DRAW_FORMAT]);
  });

  it('preserves every distinct code when draws disagree', () => {
    // Deliberate: the survey must not collapse a mixed-format event to one
    // code, because a caller cannot then tell the event is not uniform.
    const event: any = {
      drawDefinitions: [{ matchUpFormat: DRAW_FORMAT }, { matchUpFormat: RALLY_FORMAT }],
    };
    expect(getEventMatchUpFormats(event)).toEqual([DRAW_FORMAT, RALLY_FORMAT]);
  });

  it('returns an empty array when nothing declares a format', () => {
    expect(getEventMatchUpFormats({ drawDefinitions: [{ structures: [{}] }] } as any)).toEqual([]);
    expect(getEventMatchUpFormats({} as any)).toEqual([]);
    expect(getEventMatchUpFormats(undefined)).toEqual([]);
  });
});

describe('extractEventInfo', () => {
  it('projects matchUpFormats without disturbing the event-level matchUpFormat', () => {
    const event: any = {
      eventId: 'e1',
      eventName: 'Mens Open Singles',
      drawDefinitions: [{ matchUpFormat: DRAW_FORMAT }],
    };
    const { eventInfo }: any = extractEventInfo({ event });

    // The event declares none, so the existing field keeps its exact meaning...
    expect(eventInfo.matchUpFormat).toBeUndefined();
    // ...while the survey exposes what the draws declare.
    expect(eventInfo.matchUpFormats).toEqual([DRAW_FORMAT]);
  });

  it('omits matchUpFormats entirely when no format is declared anywhere', () => {
    const { eventInfo }: any = extractEventInfo({ event: { eventId: 'e1' } });
    expect(eventInfo.matchUpFormats).toBeUndefined();
    expect('matchUpFormats' in eventInfo).toBe(true);
  });

  it('projects the event competitionFormat, which was previously dropped', () => {
    const competitionFormat: any = { sport: 'PICKLEBALL' };
    const { eventInfo }: any = extractEventInfo({ event: { eventId: 'e1', competitionFormat } });
    expect(eventInfo.competitionFormat).toEqual(competitionFormat);
  });

  it('keeps every field it projected before', () => {
    const event: any = {
      eventId: 'e1',
      eventName: 'Mens Open Singles',
      eventType: 'SINGLES',
      gender: 'MALE',
      matchUpFormat: EVENT_FORMAT,
      surfaceCategory: 'HARD',
      discipline: 'TENNIS',
      entries: [{}, {}, {}],
    };
    const { eventInfo }: any = extractEventInfo({ event });
    expect(eventInfo.eventId).toEqual('e1');
    expect(eventInfo.eventName).toEqual('Mens Open Singles');
    expect(eventInfo.eventType).toEqual('SINGLES');
    expect(eventInfo.gender).toEqual('MALE');
    expect(eventInfo.matchUpFormat).toEqual(EVENT_FORMAT);
    expect(eventInfo.surfaceCategory).toEqual('HARD');
    expect(eventInfo.discipline).toEqual('TENNIS');
    expect(eventInfo.entriesCount).toEqual(3);
  });
});

describe('getTournamentInfo eventInfo', () => {
  it('surfaces a generated draw format that the event itself does not declare', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, matchUpFormat: DRAW_FORMAT }],
      setState: true,
      nonRandom: 1,
    });
    tournamentEngine.setState(tournamentRecord);

    // getTournamentInfo hangs eventInfo off tournamentInfo, not the top level.
    const { tournamentInfo }: any = tournamentEngine.getTournamentInfo();
    const eventInfo = tournamentInfo.eventInfo;
    expect(eventInfo.length).toEqual(1);
    // The projection reaches the code wherever mocksEngine stored it.
    expect(eventInfo[0].matchUpFormats).toContain(DRAW_FORMAT);
  });
});
