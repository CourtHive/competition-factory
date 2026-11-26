import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { FEED_IN, MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { ROUND_TARGET } from '@Constants/extensionConstants';
import {
  INVALID_PARTICIPANT_IDS,
  INVALID_STAGE,
  INVALID_VALUES,
  MISSING_VALUE,
  PARTICIPANT_ENTRY_NOT_FOUND,
} from '@Constants/errorConditionConstants';

/** An event with `main` MAIN entries and `qualifying` QUALIFYING entries, and the participantIds of each. */
function setup({ main = 4, qualifying = 8 } = {}) {
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: main + qualifying },
    setState: true,
  });
  const participantIds = tournamentEngine.getParticipants().participants.map(({ participantId }) => participantId);
  const { event } = tournamentEngine.addEvent({ event: { eventName: 'Paths' } });
  const mainIds = participantIds.slice(0, main);
  const qualifyingIds = participantIds.slice(main);
  tournamentEngine.addEventEntries({ eventId: event.eventId, participantIds: mainIds });
  tournamentEngine.addEventEntries({ eventId: event.eventId, participantIds: qualifyingIds, entryStage: QUALIFYING });
  return { eventId: event.eventId, mainIds, qualifyingIds };
}

/** The path recorded on each participant's entry: [entryStageSequence, roundTarget]. */
function paths(entries: any[], participantIds: string[]) {
  return participantIds.map((participantId) => {
    const entry = entries.find((e) => e.participantId === participantId);
    const roundTarget = entry?.roundTarget ?? entry?.extensions?.find(({ name }) => name === ROUND_TARGET)?.value;
    return [entry?.entryStageSequence, roundTarget];
  });
}

const eventEntries = (eventId: string) => tournamentEngine.getEvent({ eventId }).event.entries;

describe('setEntryQualifyingPath', () => {
  it("sets the path on the event's entries, and leaves the others as they were", () => {
    const { eventId, qualifyingIds } = setup();
    const [stronger, weaker] = [qualifyingIds.slice(0, 4), qualifyingIds.slice(4)];

    let result: any = tournamentEngine.setEntryQualifyingPath({
      participantIds: stronger,
      entryStageSequence: 2,
      roundTarget: 3,
      eventId,
    });
    expect(result.success).toEqual(true);
    expect(paths(eventEntries(eventId), stronger)).toEqual(stronger.map(() => [2, 3]));
    expect(paths(eventEntries(eventId), weaker)).toEqual(weaker.map(() => [undefined, undefined]));

    // either attribute alone; the other is kept
    result = tournamentEngine.setEntryQualifyingPath({ participantIds: stronger, roundTarget: 1, eventId });
    expect(result.success).toEqual(true);
    expect(paths(eventEntries(eventId), stronger)).toEqual(stronger.map(() => [2, 1]));
  });

  it("with a drawId, changes that flight's and draw's entries; without one, every copy", () => {
    const { eventId, qualifyingIds } = setup();
    const drawId = 'flight-1';
    const drawEntries = eventEntries(eventId).filter(({ participantId }) => qualifyingIds.includes(participantId));
    expect(tournamentEngine.addFlight({ eventId, drawId, drawName: 'Flight 1', drawEntries }).success).toBe(true);
    const flightEntries = () =>
      tournamentEngine.getFlightProfile({ eventId }).flightProfile.flights.find((f) => f.drawId === drawId).drawEntries;

    let result: any = tournamentEngine.setEntryQualifyingPath({
      participantIds: qualifyingIds,
      roundTarget: 2,
      eventId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(paths(flightEntries(), qualifyingIds)).toEqual(qualifyingIds.map(() => [undefined, 2]));
    expect(paths(eventEntries(eventId), qualifyingIds)).toEqual(qualifyingIds.map(() => [undefined, undefined]));

    result = tournamentEngine.setEntryQualifyingPath({ participantIds: qualifyingIds, entryStageSequence: 1, eventId });
    expect(result.success).toEqual(true);
    expect(paths(flightEntries(), qualifyingIds)).toEqual(qualifyingIds.map(() => [1, 2]));
    expect(paths(eventEntries(eventId), qualifyingIds)).toEqual(qualifyingIds.map(() => [1, undefined]));
  });

  it('refuses what is not a qualifying path, and then changes nothing', () => {
    const { eventId, mainIds, qualifyingIds } = setup();
    const set = (params: any) => tournamentEngine.setEntryQualifyingPath({ eventId, ...params });

    expect(set({ participantIds: qualifyingIds }).error).toEqual(MISSING_VALUE);
    expect(set({ participantIds: [], roundTarget: 1 }).error).toEqual(INVALID_PARTICIPANT_IDS);
    for (const value of [0, -1, 1.5, '2'])
      expect(set({ participantIds: qualifyingIds, roundTarget: value }).error).toEqual(INVALID_VALUES);
    expect(set({ participantIds: qualifyingIds, entryStageSequence: 0 }).error).toEqual(INVALID_VALUES);
    expect(set({ participantIds: [...qualifyingIds, 'nobody'], roundTarget: 3 }).error).toEqual(
      PARTICIPANT_ENTRY_NOT_FOUND,
    );
    // a MAIN entry among them: no entry changes, the qualifying ones included
    expect(set({ participantIds: [...qualifyingIds, mainIds[0]], roundTarget: 3 }).error).toEqual(INVALID_STAGE);
    expect(paths(eventEntries(eventId), qualifyingIds)).toEqual(qualifyingIds.map(() => [undefined, undefined]));
  });

  it('paths set after entry seat the qualifiers where they lead', () => {
    // a staggered qualifying event (generated): 24 MAIN entries, a stronger 16 qualifying for R3 and a weaker 32 for R1,
    // their paths set after entry as the topology builder will set them
    const { eventId, qualifyingIds } = setup({ main: 24, qualifying: 48 });
    const [stronger, weaker] = [qualifyingIds.slice(0, 16), qualifyingIds.slice(16)];
    expect(tournamentEngine.setEntryQualifyingPath({ eventId, participantIds: stronger, roundTarget: 3 }).success).toBe(
      true,
    );
    expect(tournamentEngine.setEntryQualifyingPath({ eventId, participantIds: weaker, roundTarget: 1 }).success).toBe(
      true,
    );

    const result: any = tournamentEngine.generateDrawDefinition({
      structureOptions: { feedRoundsProfile: [8, 8] },
      qualifyingProfiles: [
        { roundTarget: 3, structureProfiles: [{ drawSize: 16, qualifyingPositions: 8 }] },
        { roundTarget: 1, structureProfiles: [{ drawSize: 32, qualifyingPositions: 8 }] },
      ],
      drawType: FEED_IN,
      drawSize: 48,
      eventId,
    });
    expect(result.error).toBeUndefined();

    const structures = result.drawDefinition.structures;
    const qualifying = structures.filter(({ stage }) => stage === QUALIFYING);
    const seatedIn = (roundTarget: number) =>
      qualifying
        .find(
          (structure) =>
            (structure.roundTarget ?? structure.extensions?.find(({ name }) => name === ROUND_TARGET)?.value) ===
            roundTarget,
        )
        .positionAssignments.map(({ participantId }) => participantId)
        .filter(Boolean);
    expect(new Set(seatedIn(3))).toEqual(new Set(stronger));
    expect(new Set(seatedIn(1))).toEqual(new Set(weaker));
    expect(
      structures.find(({ stage }) => stage === MAIN).positionAssignments.filter(({ qualifier }) => qualifier).length,
    ).toEqual(16);
  });
});
