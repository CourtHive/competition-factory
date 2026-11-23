import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { ALTERNATE, DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { PARTICIPANT_ENTRY_NOT_FOUND } from '@Constants/errorConditionConstants';

const entryOf = (entries, participantId) => entries.find((entry) => entry.participantId === participantId);
const eventEntries = (eventId) => tournamentEngine.getEvent({ eventId }).event.entries;
const alternatesOf = (entries, stage = MAIN) =>
  entries.filter((entry) => entry.entryStatus === ALTERNATE && (entry.entryStage ?? MAIN) === stage);
const acceptedPositions = (entries, stage = MAIN) =>
  entries
    .filter((entry) => entry.entryStatus === DIRECT_ACCEPTANCE && (entry.entryStage ?? MAIN) === stage)
    .map(({ entryPosition }) => entryPosition);

// an event of `accepted` positioned entries and `alternates` alternates, with no draw
function eventWithAlternates({ accepted = 6, alternates = 3 } = {}) {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ participantsProfile: { participantsCount: accepted } }],
    participantsProfile: { participantsCount: accepted + alternates },
    setState: true,
  });
  const entered = eventEntries(eventId).map(({ participantId }) => participantId);
  const alternateIds = tournamentEngine
    .getParticipants()
    .participants.map(({ participantId }) => participantId)
    .filter((participantId) => !entered.includes(participantId))
    .slice(0, alternates);
  let result: any = tournamentEngine.addEventEntries({ eventId, participantIds: alternateIds, entryStatus: ALTERNATE });
  expect(result.success).toEqual(true);
  return { eventId, alternateIds };
}

describe('promoteAlternates entryPositions', () => {
  it('places an unpositioned alternate after the accepted entries, not on the last one', () => {
    const { eventId, alternateIds } = eventWithAlternates();
    expect(acceptedPositions(eventEntries(eventId))).toEqual([1, 2, 3, 4, 5, 6]);

    let result: any = tournamentEngine.promoteAlternates({ eventId, participantIds: [alternateIds[0]] });
    expect(result.success).toEqual(true);

    const positions = acceptedPositions(eventEntries(eventId));
    expect(entryOf(eventEntries(eventId), alternateIds[0]).entryPosition).toEqual(7);
    expect(new Set(positions).size).toEqual(positions.length);
  });

  it('places a positioned alternate after the accepted entries and closes up the alternates', () => {
    const { eventId, alternateIds } = eventWithAlternates();
    let result: any = tournamentEngine.setEntryPositions({
      entryPositions: alternateIds.map((participantId, index) => ({ participantId, entryPosition: index + 1 })),
      eventId,
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.promoteAlternate({ eventId });
    expect(result.success).toEqual(true);

    const entries = eventEntries(eventId);
    expect(entryOf(entries, alternateIds[0])).toMatchObject({ entryStatus: DIRECT_ACCEPTANCE, entryPosition: 7 });
    expect(alternatesOf(entries).map(({ participantId, entryPosition }) => [participantId, entryPosition])).toEqual([
      [alternateIds[1], 1],
      [alternateIds[2], 2],
    ]);
  });

  it('promotes several in the order given, each with its own position', () => {
    const { eventId, alternateIds } = eventWithAlternates();
    tournamentEngine.setEntryPositions({
      entryPositions: alternateIds.map((participantId, index) => ({ participantId, entryPosition: index + 1 })),
      eventId,
    });

    let result: any = tournamentEngine.promoteAlternates({ eventId, participantIds: alternateIds.slice(0, 2) });
    expect(result.success).toEqual(true);

    let entries = eventEntries(eventId);
    expect(entryOf(entries, alternateIds[0]).entryPosition).toEqual(7);
    expect(entryOf(entries, alternateIds[1]).entryPosition).toEqual(8);
    expect(entryOf(entries, alternateIds[2])).toMatchObject({ entryStatus: ALTERNATE, entryPosition: 1 });
    expect(acceptedPositions(entries)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    // the order given is the order of acceptance
    const other = eventWithAlternates();
    result = tournamentEngine.promoteAlternates({
      eventId: other.eventId,
      participantIds: other.alternateIds.toReversed(),
    });
    expect(result.success).toEqual(true);
    entries = eventEntries(other.eventId);
    expect(other.alternateIds.map((id) => entryOf(entries, id).entryPosition)).toEqual([9, 8, 7]);
  });

  it('leaves the promoted entry unpositioned when no accepted entry is positioned', () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 5 },
    });
    const ids = tournamentRecord.participants.map(({ participantId }) => participantId);
    // a record whose entries carry no entryPosition at all
    const entries = ids.map((participantId, index) => ({
      entryStatus: index < 4 ? DIRECT_ACCEPTANCE : ALTERNATE,
      entryStage: MAIN,
      participantId,
    }));
    const eventId = 'unpositioned';
    tournamentRecord.events = [{ eventId, eventName: 'Unpositioned', entries } as any];
    let result: any = tournamentEngine.setState(tournamentRecord);
    expect(result.success).toEqual(true);
    expect(acceptedPositions(eventEntries(eventId))).toEqual([undefined, undefined, undefined, undefined]);

    result = tournamentEngine.promoteAlternates({ eventId, participantIds: ids.slice(4) });
    expect(result.success).toEqual(true);
    expect(entryOf(eventEntries(eventId), ids[4])).toMatchObject({ entryStatus: DIRECT_ACCEPTANCE });
    expect(entryOf(eventEntries(eventId), ids[4]).entryPosition).toBeUndefined();
  });

  it('picks the lowest positioned alternate ahead of an unpositioned one entered first', () => {
    const { eventId, alternateIds } = eventWithAlternates();
    // the first alternate entered stays unpositioned; the other two are positioned 2 and 1
    let result: any = tournamentEngine.setEntryPositions({
      entryPositions: [
        { participantId: alternateIds[1], entryPosition: 2 },
        { participantId: alternateIds[2], entryPosition: 1 },
      ],
      eventId,
    });
    expect(result.success).toEqual(true);
    const before = eventEntries(eventId);
    const unpositioned = alternatesOf(before).find(({ entryPosition }) => entryPosition === undefined);

    result = tournamentEngine.promoteAlternate({ eventId });
    expect(result.success).toEqual(true);
    const lowest = alternatesOf(before)
      .filter(({ entryPosition }) => entryPosition !== undefined)
      .sort((a, b) => a.entryPosition - b.entryPosition)[0];
    expect(entryOf(eventEntries(eventId), lowest.participantId).entryStatus).toEqual(DIRECT_ACCEPTANCE);
    if (unpositioned) expect(entryOf(eventEntries(eventId), unpositioned.participantId).entryStatus).toEqual(ALTERNATE);
  });
});

describe('promoteAlternates refuses before it writes', () => {
  it('refuses an id that is not an entry instead of promoting the next alternate', () => {
    const { eventId } = eventWithAlternates();
    const before = JSON.stringify(eventEntries(eventId));

    let result: any = tournamentEngine.promoteAlternate({ eventId, participantId: 'not-an-entry' });
    expect(result.error).toEqual(PARTICIPANT_ENTRY_NOT_FOUND);
    expect(JSON.stringify(eventEntries(eventId))).toEqual(before);
  });

  it('refuses the whole call when one of several ids is not an entry', () => {
    const { eventId, alternateIds } = eventWithAlternates();
    const before = JSON.stringify(eventEntries(eventId));

    let result: any = tournamentEngine.promoteAlternates({ eventId, participantIds: [alternateIds[0], 'missing'] });
    expect(result.error).toEqual(PARTICIPANT_ENTRY_NOT_FOUND);
    expect(JSON.stringify(eventEntries(eventId))).toEqual(before);
  });

  it('given a drawId alone, leaves the event untouched when the draw does not hold the alternate', () => {
    const {
      eventIds: [eventId],
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 8, participantsCount: 6 }],
      setState: true,
    });
    const before = eventEntries(eventId);
    const [alternate] = alternatesOf(before);
    expect(alternate).toBeDefined();

    let result: any = tournamentEngine.promoteAlternate({ drawId, participantId: alternate.participantId });
    expect(result.error).toEqual(PARTICIPANT_ENTRY_NOT_FOUND);
    expect(eventEntries(eventId)).toEqual(before);

    // with the eventId the event is promoted and the draw's refusal is reported, not returned
    result = tournamentEngine.promoteAlternate({ eventId, drawId, participantId: alternate.participantId });
    expect(result.success).toEqual(true);
    expect(result.context?.drawPromotionError).toEqual(PARTICIPANT_ENTRY_NOT_FOUND);
    expect(entryOf(eventEntries(eventId), alternate.participantId).entryStatus).toEqual(DIRECT_ACCEPTANCE);
  });
});

describe('promoteAlternates by stage and flight', () => {
  it('promotes a qualifying alternate after the qualifying accepted entries only', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ participantsProfile: { participantsCount: 4 } }],
      participantsProfile: { participantsCount: 10 },
      setState: true,
    });
    const entered = eventEntries(eventId).map(({ participantId }) => participantId);
    const free = tournamentEngine
      .getParticipants()
      .participants.map(({ participantId }) => participantId)
      .filter((participantId) => !entered.includes(participantId));
    let result: any = tournamentEngine.addEventEntries({
      participantIds: free.slice(0, 2),
      entryStage: QUALIFYING,
      eventId,
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.addEventEntries({
      participantIds: free.slice(2, 3),
      entryStatus: ALTERNATE,
      entryStage: QUALIFYING,
      eventId,
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.setEntryPositions({
      entryPositions: free.slice(0, 2).map((participantId, index) => ({ participantId, entryPosition: index + 1 })),
      eventId,
    });
    expect(result.success).toEqual(true);
    const mainBefore = acceptedPositions(eventEntries(eventId));

    // a MAIN promotion does not reach a qualifying alternate
    result = tournamentEngine.promoteAlternate({ eventId });
    expect(result.error).toEqual(PARTICIPANT_ENTRY_NOT_FOUND);

    result = tournamentEngine.promoteAlternate({ eventId, stage: QUALIFYING });
    expect(result.success).toEqual(true);
    const entries = eventEntries(eventId);
    expect(entryOf(entries, free[2])).toMatchObject({ entryStatus: DIRECT_ACCEPTANCE, entryPosition: 3 });
    expect(acceptedPositions(entries)).toEqual(mainBefore);
  });

  it('honours stageSequence against the entry stage sequence', () => {
    const { eventId, alternateIds } = eventWithAlternates({ accepted: 4, alternates: 1 });
    let result: any = tournamentEngine.promoteAlternate({ eventId, stageSequence: 2, participantId: alternateIds[0] });
    expect(result.error).toBeDefined();
    expect(entryOf(eventEntries(eventId), alternateIds[0]).entryStatus).toEqual(ALTERNATE);
  });

  it('promotes the alternate in a flight that has no draw yet', () => {
    const {
      eventIds: [eventId],
    } = mocksEngine.generateTournamentRecord({
      eventProfiles: [{ participantsProfile: { participantsCount: 8 } }],
      participantsProfile: { participantsCount: 10 },
      setState: true,
    });
    let result: any = tournamentEngine.generateFlightProfile({ eventId, flightsCount: 1, attachFlightProfile: true });
    expect(result.success).toEqual(true);
    const [flight] = tournamentEngine.getFlightProfile({ eventId }).flightProfile.flights;

    const entered = eventEntries(eventId).map(({ participantId }) => participantId);
    const alternateId = tournamentEngine
      .getParticipants()
      .participants.map(({ participantId }) => participantId)
      .find((participantId) => !entered.includes(participantId));
    result = tournamentEngine.addEventEntries({
      participantIds: [alternateId],
      drawId: flight.drawId,
      entryStatus: ALTERNATE,
      eventId,
    });
    expect(result.success).toEqual(true);
    const flightEntry = () =>
      entryOf(tournamentEngine.getFlightProfile({ eventId }).flightProfile.flights[0].drawEntries, alternateId);
    expect(flightEntry().entryStatus).toEqual(ALTERNATE);

    result = tournamentEngine.promoteAlternates({ eventId, participantIds: [alternateId] });
    expect(result.success).toEqual(true);
    expect(entryOf(eventEntries(eventId), alternateId).entryStatus).toEqual(DIRECT_ACCEPTANCE);
    expect(flightEntry().entryStatus).toEqual(DIRECT_ACCEPTANCE);
  });
});
