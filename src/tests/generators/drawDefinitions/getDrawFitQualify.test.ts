import { generateDrawDefinition } from '@Generators/drawDefinitions/generateDrawDefinition/generateDrawDefinition';
import { getDrawFitProposals } from '@Generators/drawDefinitions/getDrawFitProposals';
import { addDrawDefinition } from '@Mutate/drawDefinitions/addDrawDefinition';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants and types
import { ALTERNATE, DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import type { Entry } from '@Types/tournamentTypes';

function fixture(mainCount = 40, qualifyingCount = 0, mainAlternates = 0, qualifyingAlternates = 0) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    nonRandom: 1,
    setState: false,
    participantsProfile: { participantsCount: mainCount + qualifyingCount + mainAlternates + qualifyingAlternates },
    eventProfiles: [{ eventName: 'Qualify' }],
  });
  const event = tournamentRecord.events![0];
  const ids = tournamentRecord.participants!.map((p) => p.participantId);
  const entries: Entry[] = [];
  for (const [count, entryStage, entryStatus] of [
    [mainCount, MAIN, DIRECT_ACCEPTANCE],
    [qualifyingCount, QUALIFYING, DIRECT_ACCEPTANCE],
    [mainAlternates, MAIN, ALTERNATE],
    [qualifyingAlternates, QUALIFYING, ALTERNATE],
  ] as const) {
    for (let i = 0; i < count; i++) entries.push({ participantId: ids[entries.length], entryStage, entryStatus });
  }
  event.entries = entries;
  return { tournamentRecord, event, rankedEntries: [...entries], drawSize: 32 };
}
const qualify = (args: ReturnType<typeof fixture>) => {
  const result = getDrawFitProposals(args);
  expect(result.success).toBe(true);
  return result.proposals!.filter((proposal) => proposal.kind === 'Qualify');
};

it('moves the lowest ranked main entrants to a real qualifying bracket, without extra BYEs', () => {
  const args = fixture();
  const before = structuredClone(args);
  const proposal = qualify(args)[0];
  expect(proposal).toMatchObject({
    drawSize: 32,
    qualifyingPositions: 8,
    qualifyingDrawSize: 16,
    consequence: { movedToQualifying: 16, promotedAlternates: 0 },
  });
  expect(proposal.entryChanges.map((change) => change.participantId)).toEqual(
    args.rankedEntries.slice(24).map((entry) => entry.participantId),
  );
  expect(proposal.entryChanges.every((change) => change.entryStage === MAIN && change.toStage === QUALIFYING)).toBe(
    true,
  );
  expect(proposal.fit.structures?.every((structure) => structure.status === 'FITS')).toBe(true);
  expect(args).toEqual(before);
});

it.each([
  [8, 16, 24],
  [16, 8, 16],
])('keeps %i qualifying entrants in qualifying and sizes their pool', (given, slots, moved) => {
  const args = fixture(40, given);
  const proposal = qualify(args)[0];
  expect(proposal).toMatchObject({
    qualifyingPositions: slots,
    qualifyingDrawSize: 32,
    consequence: { movedToQualifying: moved },
  });
  expect(proposal.fit.ledger?.QUALIFYING.selectedCount).toBe(32);
  expect(proposal.entryChanges.every((change) => change.entryStage === MAIN && change.toStage === QUALIFYING)).toBe(
    true,
  );
});

it('promotes ranked alternates from either stage and leaves the rest below the qualifying line', () => {
  const args = fixture(40, 0, 3, 6);
  const proposal = qualify(args)[0];
  expect(proposal).toMatchObject({
    qualifyingPositions: 1,
    qualifyingDrawSize: 16,
    consequence: { movedToQualifying: 9, promotedAlternates: 7 },
  });
  const promoted = proposal.entryChanges.filter(
    (change) =>
      change.entryStatus === DIRECT_ACCEPTANCE &&
      args.event.entries!.find((entry) => entry.participantId === change.participantId)?.entryStatus === ALTERNATE,
  );
  expect(promoted.map((change) => change.participantId)).toEqual(
    args.rankedEntries.slice(40, 47).map((entry) => entry.participantId),
  );
  expect(new Set(promoted.map((change) => change.entryStage))).toEqual(new Set([MAIN, QUALIFYING]));
  expect(proposal.fit.ledger?.QUALIFYING).toMatchObject({ selectedCount: 16, alternates: 2 });
});

it('enforces sanction permission again when generating and attaching a draw', () => {
  const args = fixture();
  args.tournamentRecord.sanction = {
    sanctioningId: 'sanction',
    constraints: {
      definedBy: { providerId: 'governing-body' },
      events: [{ match: { eventType: args.event.eventType! }, drawSize: 32, overrideLimits: { drawSize: 64 } }],
    },
  };
  const before = structuredClone(args.tournamentRecord);
  let result: any = generateDrawDefinition({ ...args, drawSize: 64, ignoreStageSpace: true });
  expect(result.error).toBeDefined();
  result = generateDrawDefinition({ ...args, drawSize: 64, constraintOverrides: { drawSize: 64 } });
  expect(result.success).toBe(true);
  const drawDefinition = result.drawDefinition;
  drawDefinition.structures.forEach((structure) => {
    if (structure.stage === MAIN) delete structure.stageSequence;
  });
  expect(addDrawDefinition({ ...args, drawDefinition }).error).toBeDefined();
  expect(args.tournamentRecord).toEqual(before);
  expect(addDrawDefinition({ ...args, drawDefinition, constraintOverrides: { drawSize: 128 } }).error).toBeDefined();
  expect(addDrawDefinition({ ...args, drawDefinition, constraintOverrides: { drawSize: 64 } }).success).toBe(true);
});

it('requires record permission for qualifier slots and rechecks it when the result is attached', () => {
  const args = fixture();
  args.tournamentRecord.sanction = {
    sanctioningId: 'sanction',
    constraints: {
      definedBy: { providerId: 'governing-body' },
      events: [{ match: { eventType: args.event.eventType! }, maxQualifiers: 4, overrideLimits: { maxQualifiers: 8 } }],
    },
  };
  expect(qualify(args)).toEqual([]);
  const permitted = { ...args, constraintOverrides: { maxQualifiers: 8 } };
  const proposal = qualify(permitted)[0];
  expect(proposal.qualifyingPositions).toBe(8);
  const changes = new Map(proposal.entryChanges.map((change) => [change.participantId, change]));
  const drawEntries = args.event.entries!.map((entry) => ({
    ...entry,
    entryStage: changes.get(entry.participantId)?.toStage ?? entry.entryStage,
  }));
  let result: any = generateDrawDefinition({
    ...permitted,
    drawEntries,
    qualifyingProfiles: [{ structureProfiles: [{ drawSize: 16, qualifyingPositions: 8 }] }],
  });
  expect(result.success).toBe(true);
  expect(addDrawDefinition({ ...args, drawDefinition: result.drawDefinition }).error).toBeDefined();
  expect(addDrawDefinition({ ...permitted, drawDefinition: result.drawDefinition }).success).toBe(true);
});

it('rolls back earlier stage moves when the Generate queue fails the authoritative sanction check', () => {
  const args = fixture();
  const generated = generateDrawDefinition({ ...args, drawSize: 64 });
  expect(generated.success).toBe(true);
  args.tournamentRecord.sanction = {
    sanctioningId: 'sanction',
    constraints: {
      definedBy: { providerId: 'governing-body' },
      events: [{ match: { eventType: args.event.eventType! }, drawSize: 32 }],
    },
  };
  tournamentEngine.setState(args.tournamentRecord);
  const before = tournamentEngine.getState();
  let result: any = tournamentEngine.executionQueue(
    [
      {
        method: 'modifyEntriesStatus',
        params: {
          eventId: args.event.eventId,
          participantIds: [args.event.entries![0].participantId],
          stage: MAIN,
          entryStage: QUALIFYING,
          entryStatus: DIRECT_ACCEPTANCE,
        },
      },
      {
        method: 'addDrawDefinition',
        params: {
          eventId: args.event.eventId,
          drawDefinition: generated.drawDefinition,
          constraintOverrides: { drawSize: 64 },
        },
      },
    ],
    true,
  );
  expect(result.error).toBeDefined();
  expect(result.rolledBack).toBe(true);
  expect(tournamentEngine.getState()).toEqual(before);
});

it('also enforces a stricter requested limit on a legacy-constrained draw', () => {
  const args = fixture(16);
  args.tournamentRecord.extensions = [
    {
      name: 'sanctioningConstraints',
      value: {
        events: [{ eventType: args.event.eventType, drawSize: 32 }],
      },
    },
  ];
  let result: any = generateDrawDefinition({ ...args, drawSize: 32, constraintOverrides: { drawSize: 16 } });
  expect(result.error).toBeDefined();
  result = generateDrawDefinition({ ...args, drawSize: 16, constraintOverrides: { drawSize: 16 } });
  expect(result.success).toBe(true);
});

it('counts actual qualifier placeholders even when no qualifying link is attached', () => {
  const args = fixture(4);
  const generated = generateDrawDefinition({ ...args, drawSize: 4, automated: true });
  expect(generated.success).toBe(true);
  const drawDefinition = generated.drawDefinition!;
  const main = drawDefinition.structures!.find((structure) => structure.stage === MAIN)!;
  for (const assignment of main.positionAssignments!.slice(0, 2)) {
    delete assignment.participantId;
    assignment.qualifier = true;
  }
  args.tournamentRecord.sanction = {
    sanctioningId: 'sanction',
    constraints: {
      definedBy: { providerId: 'governing-body' },
      events: [{ match: { eventType: args.event.eventType! }, maxQualifiers: 1 }],
    },
  };
  expect(addDrawDefinition({ ...args, drawDefinition }).error).toBeDefined();
  expect(args.event.drawDefinitions).toEqual([]);
});

it('accounts for the existing qualifying field even when MAIN alone already fits', () => {
  const args = fixture(32, 8);
  const proposal = qualify(args)[0];
  expect(proposal).toMatchObject({
    drawSize: 32,
    qualifyingDrawSize: 16,
    qualifyingPositions: 8,
    consequence: { movedToQualifying: 8 },
  });
  expect(proposal.fit.ledger?.QUALIFYING.selectedCount).toBe(16);
  expect(proposal.fit.structures?.every((structure) => structure.status === 'FITS')).toBe(true);
});

it('can fit a given qualifying field without a main demotion when the main seeds absorb its BYEs', () => {
  const args = { ...fixture(26, 8), seedsCount: 8 };
  const proposal = qualify(args)[0];
  expect(proposal).toMatchObject({
    drawSize: 32,
    qualifyingDrawSize: 8,
    qualifyingPositions: 1,
    entryChanges: [],
    consequence: { movedToQualifying: 0, byesBeyondSeeds: 0 },
  });
  expect(proposal.fit.ledger?.QUALIFYING.selectedCount).toBe(8);
  expect(proposal.fit.structures?.every((structure) => structure.status === 'FITS')).toBe(true);
});

it.each(['ROUND_ROBIN', 'FEED_IN'] as const)('retains the %s main format when adding qualifying', (drawType) => {
  const args = { ...fixture(10), drawSize: 8, drawType, structureOptions: { groupSize: 4 } };
  const proposal = qualify(args)[0];
  expect(proposal).toMatchObject({
    drawType,
    drawSize: 8,
    qualifyingDrawSize: 4,
    qualifyingPositions: 2,
    consequence: { movedToQualifying: 4 },
  });
  expect(proposal.fit.structures?.every((structure) => structure.status === 'FITS')).toBe(true);
});

it('ranks participant-stage pairs independently and preserves an existing qualifying entry during a Cut', () => {
  const args = fixture(8, 8);
  args.event.entries![8].participantId = args.event.entries![7].participantId;
  const rankedEntries = structuredClone(args.event.entries!);
  let result: any = getDrawFitProposals({
    ...args,
    drawSize: 4,
    rankedEntries,
    qualifyingProfiles: [{ structureProfiles: [{ drawSize: 8, qualifyingPositions: 2 }] }],
  });
  expect(result.success).toBe(true);
  const cut = result.proposals.find((proposal) => proposal.kind === 'Cut');
  expect(cut.entryChanges.every((change) => change.entryStage === MAIN)).toBe(true);
  expect(cut.fit.ledger.QUALIFYING.selectedCount).toBe(8);
});

it('leaves a qualifying-first MAIN shell to explicit positioning instead of claiming a fit', () => {
  // prepareStage retains CA's 2026-10-09 rule: without MAIN entries its linked seats remain a shell.
  const args = fixture(0, 4);
  const before = structuredClone(args);
  expect(qualify(args)).toEqual([]);
  expect(args).toEqual(before);
});

it('does not treat an empty result-fed consolation as an acceptance problem', () => {
  const args = { ...fixture(26), seedsCount: 8, drawType: 'FIRST_MATCH_LOSER_CONSOLATION' as const };
  let result: any = getDrawFitProposals(args);
  expect(result.success).toBe(true);
  expect(result.proposals).toEqual([]);
});

it('does not claim a Cut or Feed-in fits while its given qualifying field is still short', () => {
  const args = {
    ...fixture(40, 12, 4),
    qualifyingProfiles: [{ structureProfiles: [{ drawSize: 16, qualifyingPositions: 4 }] }],
  };
  let result: any = getDrawFitProposals(args);
  expect(result.success).toBe(true);
  expect(result.proposals.some((proposal) => ['Cut', 'Feed-in'].includes(proposal.kind))).toBe(false);
  const proposal = result.proposals.find((proposal) => proposal.kind === 'Qualify');
  expect(proposal).toMatchObject({
    qualifyingDrawSize: 32,
    qualifyingPositions: 8,
    consequence: { movedToQualifying: 16, promotedAlternates: 4 },
  });
  expect(proposal.fit.structures.every((structure) => structure.status === 'FITS')).toBe(true);
});

it('cannot use an AD_HOC roster or ignoreStageSpace to exceed the sanctioned field size', () => {
  const args = fixture();
  args.tournamentRecord.sanction = {
    sanctioningId: 'sanction',
    constraints: {
      definedBy: { providerId: 'governing-body' },
      events: [{ match: { eventType: args.event.eventType! }, drawSize: 32, overrideLimits: { drawSize: 64 } }],
    },
  };
  let result: any = generateDrawDefinition({ ...args, drawType: 'AD_HOC', drawSize: 64, ignoreStageSpace: true });
  expect(result.error).toBeDefined();
  result = generateDrawDefinition({
    ...args,
    drawType: 'AD_HOC',
    drawSize: 64,
    ignoreStageSpace: true,
    constraintOverrides: { drawSize: 64 },
  });
  expect(result.success).toBe(true);
  expect(addDrawDefinition({ ...args, drawDefinition: result.drawDefinition }).error).toBeDefined();
  expect(
    addDrawDefinition({ ...args, drawDefinition: result.drawDefinition, constraintOverrides: { drawSize: 64 } })
      .success,
  ).toBe(true);
});
