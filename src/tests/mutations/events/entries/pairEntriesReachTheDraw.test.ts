/**
 * `addEventEntryPairs` accepts a `drawId` (resolved to a `drawDefinition` by the engine's params
 * middleware) but used to drop it before calling `addEventEntries`, whose `addDrawEntries` branch
 * gates on the id rather than the definition. The PAIR therefore never reached the drawEntries.
 *
 * That was survivable for a pair built from scratch, and destructive for the destroy/re-pair round
 * trip: `destroyPairEntries` puts the two individuals into the drawEntries as UNGROUPED, and
 * re-pairing them evicts those individuals from every drawDefinition. Without the id, the draw lost
 * two entries and gained nothing.
 */
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { AD_HOC, MAIN, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { SHARED_INDIVIDUAL_PARTICIPANT } from '@Constants/errorConditionConstants';
import { DIRECT_ACCEPTANCE, UNGROUPED } from '@Constants/entryStatusConstants';
import { PAIR } from '@Constants/participantConstants';
import { DOUBLES } from '@Constants/eventConstants';

/** 10 pairs, 8 of them in the draw — so two pairs' worth of individuals stay unentered. */
function doublesFixture(drawType: string) {
  const doublesId = 'doublesId';
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantType: PAIR, participantsCount: 10 },
    drawProfiles: [{ eventType: DOUBLES, eventId: doublesId, drawType, drawSize: 8 }],
  });
  tournamentEngine.setState(tournamentRecord);

  const { event } = tournamentEngine.getEvent({ eventId: doublesId });
  const drawId = event.drawDefinitions[0].drawId;
  return { eventId: doublesId, drawId };
}

const adHocDoublesFixture = () => doublesFixture(AD_HOC);

function drawEntries(eventId: string, drawId: string): any[] {
  const { drawDefinition } = tournamentEngine.getEvent({ eventId, drawId });
  return drawDefinition.entries ?? [];
}

/** individualParticipantIds not represented in any current draw entry, grouped or loose. */
function freeIndividualIds(eventId: string, drawId: string): string[] {
  const { tournamentRecord } = tournamentEngine.getTournament();
  const byId = new Map(tournamentRecord.participants.map((p: any) => [p.participantId, p]));
  const taken = new Set(
    drawEntries(eventId, drawId).flatMap((entry: any) => {
      const participant: any = byId.get(entry.participantId);
      return participant?.individualParticipantIds ?? [entry.participantId];
    }),
  );
  return tournamentRecord.participants
    .filter((p: any) => p.participantType === 'INDIVIDUAL' && !taken.has(p.participantId))
    .map((p: any) => p.participantId);
}

it('adds a created PAIR to the drawEntries when a drawId is provided', () => {
  const { eventId, drawId } = adHocDoublesFixture();

  const before = drawEntries(eventId, drawId).length;
  expect(before).toBeGreaterThan(0);

  const free = freeIndividualIds(eventId, drawId).slice(0, 2);
  expect(free.length).toEqual(2);

  const result = tournamentEngine.addEventEntryPairs({
    participantIdPairs: [free],
    allowDuplicateParticipantIdPairs: true,
    entryStatus: DIRECT_ACCEPTANCE,
    entryStage: MAIN,
    eventId,
    drawId,
  });
  expect(result.success).toEqual(true);

  const after = drawEntries(eventId, drawId);
  expect(after.length).toEqual(before + 1);
  expect(after.some((entry: any) => result.newParticipantIds.includes(entry.participantId))).toEqual(true);
});

it('destroy then re-pair returns the draw to the entry count it started with', () => {
  const { eventId, drawId } = adHocDoublesFixture();

  const before = drawEntries(eventId, drawId);
  const pairEntryId = before[0].participantId;

  let result: any = tournamentEngine.destroyPairEntries({
    participantIds: [pairEntryId],
    removeGroupParticipant: true,
    eventId,
    drawId,
  });
  expect(result.success).toEqual(true);

  // The two individuals are now loose in the draw — legitimate for an AD_HOC doubles field.
  const ungrouped = drawEntries(eventId, drawId).filter((entry: any) => entry.entryStatus === UNGROUPED);
  expect(ungrouped.length).toEqual(2);
  expect(drawEntries(eventId, drawId).length).toEqual(before.length + 1);

  result = tournamentEngine.addEventEntryPairs({
    participantIdPairs: [ungrouped.map((entry: any) => entry.participantId)],
    allowDuplicateParticipantIdPairs: true,
    entryStatus: DIRECT_ACCEPTANCE,
    entryStage: MAIN,
    eventId,
    drawId,
  });
  expect(result.success).toEqual(true);

  const after = drawEntries(eventId, drawId);

  // Conservative round trip: the field is the size it started at, the individuals are grouped
  // again, and their replacement is a draw entry rather than an event-only alternate.
  expect(after.length).toEqual(before.length);
  for (const entry of ungrouped) {
    expect(after.some((e: any) => e.participantId === entry.participantId)).toEqual(false);
  }
  const replacement = after.find((e: any) => result.newParticipantIds.includes(e.participantId));
  expect(replacement).toBeDefined();
  expect(replacement.entryStatus).toEqual(DIRECT_ACCEPTANCE);
});

it('leaves the drawEntries alone when no drawId is given', () => {
  const { eventId, drawId } = adHocDoublesFixture();

  const before = drawEntries(eventId, drawId).length;

  const free = freeIndividualIds(eventId, drawId).slice(0, 2);
  expect(free.length).toEqual(2);

  const result = tournamentEngine.addEventEntryPairs({
    participantIdPairs: [free],
    allowDuplicateParticipantIdPairs: true,
    entryStatus: DIRECT_ACCEPTANCE,
    entryStage: MAIN,
    eventId,
  });
  expect(result.success).toEqual(true);

  // An event-scoped pairing stays event-scoped — the draw is untouched.
  expect(drawEntries(eventId, drawId).length).toEqual(before);
});

it('surfaces the shared-individual refusal as info when the draw is bracketed', () => {
  // #4891 made `addDrawEntries` refuse a PAIR sharing an individual with an existing entry in any
  // non-adHoc drawType. Until the fix above, `addEventEntryPairs` could not reach that guard at
  // all. It can now — so this pins what a caller sees: `addEventEntries` reports an
  // `addDrawEntries` failure as `info` rather than as an error, and the PAIR stays an event entry.
  const { eventId: doublesId, drawId } = doublesFixture(SINGLE_ELIMINATION);

  const before = drawEntries(doublesId, drawId).length;

  // One individual from an entered pair, one from anywhere else — the new pair overlaps the field.
  const { tournamentRecord: current } = tournamentEngine.getTournament();
  const enteredPair = current.participants.find(
    (p: any) =>
      p.participantType === PAIR &&
      drawEntries(doublesId, drawId).some((entry: any) => entry.participantId === p.participantId),
  );
  const outsider = freeIndividualIds(doublesId, drawId)[0];
  const overlapping = [enteredPair.individualParticipantIds[0], outsider];

  const result = tournamentEngine.addEventEntryPairs({
    participantIdPairs: [overlapping],
    allowDuplicateParticipantIdPairs: true,
    entryStatus: DIRECT_ACCEPTANCE,
    entryStage: MAIN,
    eventId: doublesId,
    drawId,
  });

  // Success at event level, with the draw-level refusal reported as `info` — the caller can tell
  // the pair exists but is not in the bracket. Before this branch, `addEventEntryPairs` overwrote
  // that info with `addParticipants`' own (undefined) and the reason was lost entirely.
  expect(result.success).toEqual(true);
  expect(result.info).toEqual(SHARED_INDIVIDUAL_PARTICIPANT);

  // The bracket is untouched; the pair exists only at event level.
  expect(drawEntries(doublesId, drawId).length).toEqual(before);
  const { event: after } = tournamentEngine.getEvent({ eventId: doublesId });
  expect(after.entries.some((entry: any) => result.newParticipantIds.includes(entry.participantId))).toEqual(true);
});
