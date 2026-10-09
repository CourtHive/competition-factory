import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { FEED_IN, MAIN, QUALIFYING, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';

/**
 * A FEED_IN main populated after its qualifying (CA, 2026-10-09, in TMX): a qualifying of 32 producing
 * 8 qualifiers, then "Generate main draw" as FEED_IN 22, Automated. It was refused with "Insufficient
 * drawPositions to accommodate qualifiers".
 *
 * Two causes. BYEs are drawn only from first-round positions, and a FEED_IN's first round holds just some
 * of its drawPositions (16 of 22; 16 of 31), so the BYEs took the room the qualifiers' link needed there.
 * And with no MAIN entries yet, Automated filled every non-qualifier position with a BYE, leaving none
 * for the entries still to come. Now BYEs leave the qualifiers their room and spill onto fed positions,
 * and with no entries only the qualifier seats are placed (CA's choice).
 */
const QUALIFIERS = 8;

function setup(mainEntriesCount: number) {
  const result = mocksEngine.generateTournamentRecord({ participantsProfile: { participantsCount: 32 + 24 } });
  tournamentEngine.setState(result.tournamentRecord);
  const eventId = tournamentEngine.addEvent({ event: { eventName: 'Test', eventType: SINGLES_EVENT } }).event.eventId;
  const participantIds = tournamentEngine.getParticipants().participants.map((p: any) => p.participantId);
  tournamentEngine.addEventEntries({ participantIds: participantIds.slice(0, 32), entryStage: QUALIFYING, eventId });
  if (mainEntriesCount) {
    tournamentEngine.addEventEntries({
      participantIds: participantIds.slice(32, 32 + mainEntriesCount),
      entryStage: MAIN,
      eventId,
    });
  }
  const entries = tournamentEngine.getEvent({ eventId }).event.entries;
  const qualifying = tournamentEngine.generateDrawDefinition({
    drawEntries: entries.filter((e: any) => e.entryStage === QUALIFYING && e.entryStatus === DIRECT_ACCEPTANCE),
    qualifyingProfiles: [
      {
        structureProfiles: [{ qualifyingPositions: QUALIFIERS, drawSize: 32, drawType: SINGLE_ELIMINATION }],
      },
    ],
    qualifyingOnly: true,
    ignoreStageSpace: true,
    automated: true,
    eventId,
  });
  expect(qualifying.success).toEqual(true);
  const drawId = qualifying.drawDefinition.drawId;
  tournamentEngine.addDrawDefinition({ eventId, drawDefinition: qualifying.drawDefinition });
  const mainEntries = entries.filter((e: any) => e.entryStage === MAIN);
  return { eventId, drawId, mainEntries };
}

function populateFeedInMain(mainEntriesCount: number, drawSize: number) {
  const { eventId, drawId, mainEntries } = setup(mainEntriesCount);
  const result: any = tournamentEngine.generateDrawDefinition({
    qualifiersCount: QUALIFIERS,
    qualifyingPlaceholder: true,
    drawEntries: mainEntries,
    ignoreStageSpace: true,
    drawType: FEED_IN,
    automated: true,
    drawSize,
    eventId,
    drawId,
  });
  const main = result.drawDefinition?.structures?.find((s: any) => s.stage === MAIN);
  const firstRound = new Set(
    (main?.matchUps ?? []).filter((m: any) => m.roundNumber === 1).flatMap((m: any) => m.drawPositions),
  );
  return { result, main, firstRound, eventId, drawId };
}

describe('FEED_IN main populated after qualifying-first', () => {
  it('with no MAIN entries, Automated places the qualifier seats and leaves the rest open', () => {
    const { result, main, firstRound, eventId, drawId } = populateFeedInMain(0, 22);
    expect(result.success).toEqual(true);
    const qualifierSeats = main.positionAssignments.filter((pa: any) => pa.qualifier);
    expect(qualifierSeats.length).toEqual(QUALIFIERS);
    // the link sends the qualifiers into round 1
    expect(qualifierSeats.every((pa: any) => firstRound.has(pa.drawPosition))).toEqual(true);
    expect(main.positionAssignments.filter((pa: any) => pa.bye).length).toEqual(0);
    expect(main.positionAssignments.filter((pa: any) => !pa.qualifier && !pa.participantId).length).toEqual(14);

    tournamentEngine.addDrawDefinition({ eventId, drawDefinition: result.drawDefinition, allowReplacement: true });
    expect(tournamentEngine.getStructureInconsistencies({ drawId }).valid).toEqual(true);
  });

  it('BYEs leave the qualifiers their round-1 room and spill onto fed positions', () => {
    const cases: [number, number][] = [];
    for (const drawSize of [17, 22, 24, 31]) {
      for (const entriesCount of [1, 2, 4, 6, 9, 12, 16, 23]) {
        if (entriesCount + QUALIFIERS <= drawSize) cases.push([entriesCount, drawSize]);
      }
    }
    // CONTROL: the cases that failed before reach fed positions with their BYEs
    expect(cases).toEqual(
      expect.arrayContaining([
        [4, 22],
        [12, 31],
        [2, 22],
      ]),
    );

    for (const [entriesCount, drawSize] of cases) {
      const { result, main, firstRound, eventId, drawId } = populateFeedInMain(entriesCount, drawSize);
      const label = `${entriesCount} entries, FEED_IN ${drawSize}`;
      expect(result.success, label).toEqual(true);
      const assignments = main.positionAssignments;
      const qualifierSeats = assignments.filter((pa: any) => pa.qualifier);
      expect(qualifierSeats.length, label).toEqual(QUALIFIERS);
      expect(
        qualifierSeats.every((pa: any) => firstRound.has(pa.drawPosition)),
        label,
      ).toEqual(true);
      expect(assignments.filter((pa: any) => pa.participantId).length, label).toEqual(entriesCount);
      expect(assignments.filter((pa: any) => pa.bye).length, label).toEqual(drawSize - entriesCount - QUALIFIERS);
      expect(
        assignments.every((pa: any) => pa.participantId || pa.bye || pa.qualifier),
        label,
      ).toEqual(true);

      tournamentEngine.addDrawDefinition({ eventId, drawDefinition: result.drawDefinition, allowReplacement: true });
      expect(tournamentEngine.getStructureInconsistencies({ drawId }).valid, label).toEqual(true);
    }
  });
});
