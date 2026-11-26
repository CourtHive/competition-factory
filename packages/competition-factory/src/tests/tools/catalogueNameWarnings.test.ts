import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import tieFormatDefaults from '@Helpers/tieFormats/tieFormatDefaults';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import scaleEngine from '@Engines/scaleEngine';
import {
  CATALOGUE_NAME_WARNING_CODE,
  resetCatalogueNameWarnings,
  warnCatalogueName,
} from '@Global/catalogueNameWarnings';

// constants
import { COLLEGE_D3, DOMINANT_DUO, USTA_GOLD_TEAM_CHALLENGE } from '@Constants/tieFormatConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';

// A name that resolves a catalogue entry (a named tie format, a ratings preset) warns once per process for each input:
// a DeprecationWarning with the code FACTORY_CATALOGUE_NAME. The name keeps resolving, and nothing else changes.

let emitWarning: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetCatalogueNameWarnings();
  emitWarning = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
});
afterEach(() => {
  emitWarning.mockRestore();
  tournamentEngine.reset();
});

/** The messages warned since the last reset, in order. */
function warned(): string[] {
  return emitWarning.mock.calls.map(([message, options]: any[]) => {
    expect(options).toEqual({ type: 'DeprecationWarning', code: CATALOGUE_NAME_WARNING_CODE });
    return message;
  });
}

function emptyTournament() {
  mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: 0 }, setState: true });
}

describe('addEvent `event.tieFormatName`', () => {
  it('warns once, and adds the event with the named tie format as before', () => {
    emptyTournament();
    const first: any = tournamentEngine.addEvent({ event: { eventType: TEAM_EVENT, tieFormatName: DOMINANT_DUO } });
    expect(first.success).toEqual(true);
    expect(first.event.tieFormat.collectionDefinitions.length).toEqual(
      tieFormatDefaults({ namedFormat: DOMINANT_DUO }).collectionDefinitions.length,
    );
    const second: any = tournamentEngine.addEvent({ event: { eventType: TEAM_EVENT, tieFormatName: COLLEGE_D3 } });
    expect(second.success).toEqual(true);

    expect(warned()).toEqual([expect.stringContaining(`addEvent \`event.tieFormatName\` '${DOMINANT_DUO}'`)]);
    expect(warned()[0]).toMatch(/pass a `tieFormat` object instead/);
    expect(warned()[0]).toMatch(/migration-8\.0\.0#named-catalogue-inputs/);
  });

  it('does not warn for a tieFormat object, or for a name it refuses', () => {
    emptyTournament();
    const tieFormat = tieFormatDefaults({ namedFormat: DOMINANT_DUO });
    expect(tournamentEngine.addEvent({ event: { eventType: TEAM_EVENT, tieFormat } }).success).toEqual(true);
    expect(tournamentEngine.addEvent({ event: { eventType: TEAM_EVENT, tieFormatName: 'NONE' } }).error).toBeDefined();
    expect(warned()).toEqual([]);
  });
});

describe('generateDrawDefinition `tieFormatName`', () => {
  it('warns once when the name is resolved from the catalogue', () => {
    emptyTournament();
    const { event }: any = tournamentEngine.addEvent({ event: { eventType: TEAM_EVENT } });
    const params = { eventId: event.eventId, drawSize: 4, tieFormatName: DOMINANT_DUO };
    const { drawDefinition }: any = tournamentEngine.generateDrawDefinition(params);
    expect(drawDefinition.tieFormat.collectionDefinitions.length).toEqual(2);
    expect(tournamentEngine.generateDrawDefinition({ ...params, tieFormatName: COLLEGE_D3 }).success).toEqual(true);
    expect(warned()).toEqual([expect.stringContaining(`generateDrawDefinition \`tieFormatName\` '${DOMINANT_DUO}'`)]);
  });

  it('does not warn when the name is a tieFormat the event already holds', () => {
    emptyTournament();
    const tieFormat = tieFormatDefaults({ namedFormat: DOMINANT_DUO });
    const { event }: any = tournamentEngine.addEvent({ event: { eventType: TEAM_EVENT, tieFormat } });
    const result: any = tournamentEngine.generateDrawDefinition({
      tieFormatName: tieFormat.tieFormatName,
      eventId: event.eventId,
      drawSize: 4,
    });
    expect(result.success).toEqual(true);
    expect(warned()).toEqual([]);
  });
});

it('generateEventsFromTieFormat `tieFormatName` warns once and generates as before', () => {
  emptyTournament();
  const result: any = tournamentEngine.generateEventsFromTieFormat({
    tieFormatName: USTA_GOLD_TEAM_CHALLENGE,
    addEvents: false,
  });
  expect(result.success).toEqual(true);
  expect(result.events.length).toBeGreaterThan(0);
  tournamentEngine.generateEventsFromTieFormat({ tieFormatName: COLLEGE_D3, addEvents: false });
  expect(warned()).toEqual([
    expect.stringContaining(`generateEventsFromTieFormat \`tieFormatName\` '${USTA_GOLD_TEAM_CHALLENGE}'`),
  ]);
});

it('a mocksEngine profile `tieFormatName` warns once, and the same profile with a tieFormat does not', () => {
  const tieFormat = tieFormatDefaults({ namedFormat: DOMINANT_DUO });
  mocksEngine.generateTournamentRecord({ drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4, tieFormat }] });
  expect(warned()).toEqual([]);

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 4, tieFormatName: DOMINANT_DUO }],
    eventProfiles: [{ eventType: TEAM_EVENT, tieFormatName: COLLEGE_D3, drawProfiles: [{ drawSize: 2 }] }],
  });
  expect(tournamentRecord.events.length).toEqual(2);
  // one warning, naming the mocks profile, though the draw profile's name also reaches generateDrawDefinition
  expect(warned()).toEqual([
    expect.stringMatching(/^a mocksEngine profile `tieFormatName` '(DOMINANT_DUO|COLLEGE_D3)'/),
  ]);
});

it('an EventBuilder string warns once, and the addEvent it becomes does not warn again', () => {
  emptyTournament();
  const result: any = tournamentEngine.build.event({ eventName: 'Duo' }).team(DOMINANT_DUO).create();
  expect(result.success).toEqual(true);
  tournamentEngine.build.event({ eventName: 'D3' }).team().tieFormat(COLLEGE_D3).toDirectives();
  // the addEvent the builder runs is attributed to the builder, which has already warned
  expect(warned()).toEqual([
    expect.stringContaining(`an EventBuilder \`team()\` / \`tieFormat()\` string '${DOMINANT_DUO}'`),
  ]);
});

it('a ratings preset name warns once when it resolves, and rates as before', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 2 }] });
  tournamentRecord.events[0].competitionFormat = { ratingsPolicy: 'POLICY_RATINGS_ELO_538_NHL' };
  tournamentEngine.setState(tournamentRecord);
  const { matchUpId, drawId } = tournamentEngine.allTournamentMatchUps().matchUps[0];
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
  expect(tournamentEngine.setMatchUpStatus({ drawId, matchUpId, outcome }).success).toEqual(true);

  for (let i = 0; i < 2; i++) {
    expect(scaleEngine.generateDynamicRatings({ matchUpIds: [matchUpId] }).success).toEqual(true);
  }
  expect(warned()).toEqual([expect.stringContaining(`a \`ratingsPolicy\` preset name 'POLICY_RATINGS_ELO_538_NHL'`)]);
  expect(warned()[0]).toMatch(/pass the ratings policy object instead/);
});

it('each input warns once per process, independently of the others', () => {
  warnCatalogueName('addEvent', 'A');
  warnCatalogueName('addEvent', 'B');
  warnCatalogueName('ratingsPreset', 'C');
  warnCatalogueName('ratingsPreset', 'D');
  expect(warned().length).toEqual(2);
  resetCatalogueNameWarnings();
  warnCatalogueName('addEvent', 'E');
  expect(warned().length).toEqual(3);
});

it('falls back to console.warn where there is no process.emitWarning', () => {
  const original = process.emitWarning;
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    (process as any).emitWarning = undefined;
    warnCatalogueName('mocksProfile', DOMINANT_DUO);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/^\[DeprecationWarning\] a mocksEngine profile/);
  } finally {
    process.emitWarning = original;
    warn.mockRestore();
  }
});
