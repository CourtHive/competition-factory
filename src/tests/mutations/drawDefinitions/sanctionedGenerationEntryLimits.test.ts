import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { ALTERNATE, DIRECT_ACCEPTANCE, WILDCARD } from '@Constants/entryStatusConstants';
import { NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS } from '@Constants/errorConditionConstants';
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { SANCTIONING_CONSTRAINTS } from '@Constants/extensionConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';

/*
 * Draw generation refuses, before anything is written, entries that exceed the sanctioning constraints: a matched
 * event's maxWildcards and maxAlternates bound the WILDCARD and ALTERNATE entries of each draw stage. The refusal
 * names the status, the limit, the count the entries would reach and the participantIds over the limit. Before, the
 * generator ignored addDrawEntry's errors and produced the draw without the excess entries.
 */

const SANCTION = { events: [{ eventType: SINGLES_EVENT, maxWildcards: 2, maxAlternates: 2 }] };

type SeedArgs = {
  sanctioned?: boolean;
  directCount: number;
  wildcardCount?: number;
  alternateCount?: number;
};

// a SINGLES event with no draw, holding DIRECT_ACCEPTANCE, WILDCARD and ALTERNATE entries
function seedEvent({ sanctioned = true, directCount, wildcardCount = 0, alternateCount = 0 }: SeedArgs) {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ eventName: 'Sanctioned Singles', eventType: SINGLES_EVENT }],
    participantsProfile: { participantsCount: 32 },
    setState: true,
  });

  let result: any;
  if (sanctioned) {
    result = tournamentEngine.addTournamentExtension({ extension: { name: SANCTIONING_CONSTRAINTS, value: SANCTION } });
    expect(result.success).toEqual(true);
  }

  const participantIds = tournamentEngine.getParticipants().participants.map((p) => p.participantId);
  const directIds = participantIds.slice(0, directCount);
  const wildcardIds = participantIds.slice(directCount, directCount + wildcardCount);
  const alternateIds = participantIds.slice(directCount + wildcardCount, directCount + wildcardCount + alternateCount);
  const freeIds = participantIds.slice(directCount + wildcardCount + alternateCount);

  for (const [ids, entryStatus] of [
    [directIds, DIRECT_ACCEPTANCE],
    [wildcardIds, WILDCARD],
    [alternateIds, ALTERNATE],
  ] as [string[], string][]) {
    if (!ids.length) continue;
    result = tournamentEngine.addEventEntries({ participantIds: ids, entryStatus, eventId });
    expect(result.success).toEqual(true);
  }

  return { eventId, directIds, wildcardIds, alternateIds, freeIds };
}

// explicit drawEntries: generation from the event's entries takes only the entries selected for the structure, so
// the event's ALTERNATE entries reach a generated draw only when the drawEntries carry them
function buildDrawEntries(seeded: { directIds: string[]; wildcardIds: string[]; alternateIds: string[] }) {
  const entry = (entryStatus: string) => (participantId: string) => ({ participantId, entryStatus, entryStage: MAIN });
  return [
    ...seeded.directIds.map(entry(DIRECT_ACCEPTANCE)),
    ...seeded.wildcardIds.map(entry(WILDCARD)),
    ...seeded.alternateIds.map(entry(ALTERNATE)),
  ];
}

function drawCount(eventId: string) {
  return tournamentEngine.getEvent({ eventId }).event.drawDefinitions?.length ?? 0;
}

function statusCount(drawDefinition: any, entryStatus: string, entryStage = MAIN) {
  return drawDefinition.entries.filter((e) => e.entryStatus === entryStatus && e.entryStage === entryStage).length;
}

describe('generation refuses entries over a sanctioned maxWildcards', () => {
  it('refuses three WILDCARD entries when two are sanctioned, naming the excess', () => {
    const { eventId, wildcardIds } = seedEvent({ directCount: 5, wildcardCount: 3 });

    const result: any = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 8 });
    expect(result.error).toEqual(NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS);
    expect(result.context).toEqual({
      participantIds: [wildcardIds[2]],
      entryStatus: WILDCARD,
      stage: MAIN,
      limit: 2,
      count: 3,
    });
    expect(result.drawDefinition).toBeUndefined();
    expect(drawCount(eventId)).toEqual(0);
  });

  it('refuses explicit drawEntries holding three WILDCARD entries', () => {
    const seeded = seedEvent({ directCount: 5, wildcardCount: 3 });
    const { eventId, wildcardIds } = seeded;

    const drawEntries = buildDrawEntries(seeded);
    const result: any = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 8, drawEntries });
    expect(result.error).toEqual(NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS);
    expect(result.context.participantIds).toEqual([wildcardIds[2]]);
    expect(drawCount(eventId)).toEqual(0);
  });

  it('refuses at addDrawDefinition a draw holding three WILDCARD entries, storing nothing', () => {
    // generated before the sanction applies, then stored after it does
    const { eventId, wildcardIds } = seedEvent({ sanctioned: false, directCount: 5, wildcardCount: 3 });
    let result: any = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 8 });
    expect(result.success).toEqual(true);
    const { drawDefinition } = result;
    expect(statusCount(drawDefinition, WILDCARD)).toEqual(3);

    result = tournamentEngine.addTournamentExtension({ extension: { name: SANCTIONING_CONSTRAINTS, value: SANCTION } });
    expect(result.success).toEqual(true);

    result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
    expect(result.error).toEqual(NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS);
    expect(result.context).toEqual({
      participantIds: [wildcardIds[2]],
      entryStatus: WILDCARD,
      stage: MAIN,
      limit: 2,
      count: 3,
    });
    expect(drawCount(eventId)).toEqual(0);
  });

  it('generates and stores a draw holding two WILDCARD entries', () => {
    const { eventId } = seedEvent({ directCount: 6, wildcardCount: 2 });

    let result: any = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 8 });
    expect(result.success).toEqual(true);
    expect(statusCount(result.drawDefinition, WILDCARD)).toEqual(2);
    expect(statusCount(result.drawDefinition, DIRECT_ACCEPTANCE)).toEqual(6);

    result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition: result.drawDefinition });
    expect(result.success).toEqual(true);
    expect(drawCount(eventId)).toEqual(1);
  });
});

describe('a sanctioned WILDCARD entry that finds no open place', () => {
  it('is refused rather than dropped from the generated draw', () => {
    // within maxWildcards, but the four DIRECT_ACCEPTANCE entries fill the draw of 4 first
    const { eventId } = seedEvent({ directCount: 4, wildcardCount: 1 });

    const result: any = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 4 });
    expect(result.error).toEqual(NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS);
    expect(drawCount(eventId)).toEqual(0);
  });
});

describe('generation refuses entries over a sanctioned maxAlternates', () => {
  it('refuses three ALTERNATE entries when two are sanctioned, naming the excess', () => {
    const seeded = seedEvent({ directCount: 8, alternateCount: 3 });
    const { eventId, alternateIds } = seeded;

    const drawEntries = buildDrawEntries(seeded);
    const result: any = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 8, drawEntries });
    expect(result.error).toEqual(NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS);
    expect(result.context).toEqual({
      participantIds: [alternateIds[2]],
      entryStatus: ALTERNATE,
      stage: MAIN,
      limit: 2,
      count: 3,
    });
    expect(drawCount(eventId)).toEqual(0);
  });

  it('refuses at addDrawDefinition a draw holding three ALTERNATE entries', () => {
    const seeded = seedEvent({ sanctioned: false, directCount: 8, alternateCount: 3 });
    const { eventId, alternateIds } = seeded;
    const drawEntries = buildDrawEntries(seeded);
    let result: any = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 8, drawEntries });
    expect(result.success).toEqual(true);
    const { drawDefinition } = result;

    result = tournamentEngine.addTournamentExtension({ extension: { name: SANCTIONING_CONSTRAINTS, value: SANCTION } });
    expect(result.success).toEqual(true);

    result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
    expect(result.error).toEqual(NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS);
    expect(result.context.participantIds).toEqual([alternateIds[2]]);
    expect(drawCount(eventId)).toEqual(0);
  });

  it('generates and stores a draw holding two ALTERNATE entries', () => {
    const seeded = seedEvent({ directCount: 8, alternateCount: 2 });
    const { eventId } = seeded;

    const drawEntries = buildDrawEntries(seeded);
    let result: any = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 8, drawEntries });
    expect(result.success).toEqual(true);
    expect(statusCount(result.drawDefinition, ALTERNATE)).toEqual(2);

    result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition: result.drawDefinition });
    expect(result.success).toEqual(true);
    expect(drawCount(eventId)).toEqual(1);
  });
});

describe('qualifying added to an existing main draw', () => {
  // a sanctioned main of 8 is stored; qualifying is then generated on it with WILDCARD qualifying entries
  function seedMain() {
    const seeded = seedEvent({ directCount: 8 });
    let result: any = tournamentEngine.generateDrawDefinition({ eventId: seeded.eventId, drawSize: 8 });
    expect(result.success).toEqual(true);
    const { drawDefinition } = result;
    result = tournamentEngine.addDrawDefinition({ eventId: seeded.eventId, drawDefinition });
    expect(result.success).toEqual(true);
    return { ...seeded, drawId: drawDefinition.drawId, mainEntries: drawDefinition.entries };
  }

  function generateQualifying({ drawId, eventId, mainEntries, qualifyingIds }) {
    const drawEntries = [
      ...mainEntries,
      ...qualifyingIds.map((participantId) => ({ participantId, entryStatus: WILDCARD, entryStage: QUALIFYING })),
    ];
    return tournamentEngine.generateDrawDefinition({
      qualifyingProfiles: [{ structureProfiles: [{ drawSize: 4, qualifyingPositions: 2 }] }],
      drawEntries,
      drawSize: 8,
      eventId,
      drawId,
    });
  }

  it('refuses three QUALIFYING WILDCARD entries when two are sanctioned', () => {
    const { eventId, drawId, mainEntries, freeIds } = seedMain();
    const qualifyingIds = freeIds.slice(0, 3);
    const result: any = generateQualifying({ drawId, eventId, mainEntries, qualifyingIds });
    expect(result.error).toEqual(NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS);
    expect(result.context).toEqual({
      participantIds: [qualifyingIds[2]],
      entryStatus: WILDCARD,
      stage: QUALIFYING,
      limit: 2,
      count: 3,
    });

    // the stored draw is unchanged
    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    expect(drawDefinition.structures.some((s) => s.stage === QUALIFYING)).toEqual(false);
    expect(statusCount(drawDefinition, WILDCARD, QUALIFYING)).toEqual(0);
  });

  it('generates qualifying holding two QUALIFYING WILDCARD entries', () => {
    const { eventId, drawId, mainEntries, freeIds } = seedMain();
    const result: any = generateQualifying({ drawId, eventId, mainEntries, qualifyingIds: freeIds.slice(0, 2) });
    expect(result.success).toEqual(true);
    expect(statusCount(result.drawDefinition, WILDCARD, QUALIFYING)).toEqual(2);
  });
});

describe('unsanctioned events and unmatched constraints are unaffected', () => {
  it('an unsanctioned event generates with many WILDCARD and ALTERNATE entries', () => {
    const seeded = seedEvent({ sanctioned: false, directCount: 3, wildcardCount: 5, alternateCount: 6 });
    const { eventId } = seeded;

    const drawEntries = buildDrawEntries(seeded);
    let result: any = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 8, drawEntries });
    expect(result.success).toEqual(true);
    expect(statusCount(result.drawDefinition, WILDCARD)).toEqual(5);
    expect(statusCount(result.drawDefinition, ALTERNATE)).toEqual(6);

    result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition: result.drawDefinition });
    expect(result.success).toEqual(true);
  });

  it('constraints that do not match the event do not bound it', () => {
    const seeded = seedEvent({ sanctioned: false, directCount: 3, wildcardCount: 5, alternateCount: 6 });
    const { eventId } = seeded;
    let result: any = tournamentEngine.addTournamentExtension({
      extension: {
        name: SANCTIONING_CONSTRAINTS,
        value: { events: [{ eventType: 'DOUBLES', maxWildcards: 0, maxAlternates: 0 }] },
      },
    });
    expect(result.success).toEqual(true);

    result = tournamentEngine.generateDrawDefinition({ eventId, drawSize: 8, drawEntries: buildDrawEntries(seeded) });
    expect(result.success).toEqual(true);
    expect(statusCount(result.drawDefinition, WILDCARD)).toEqual(5);
    expect(statusCount(result.drawDefinition, ALTERNATE)).toEqual(6);

    result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition: result.drawDefinition });
    expect(result.success).toEqual(true);
  });
});
