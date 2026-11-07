import { generateDrawDefinition } from '@Generators/drawDefinitions/generateDrawDefinition/generateDrawDefinition';
import { STRUCTURE_SELECTED_STATUSES, ALTERNATE, WITHDRAWN } from '@Constants/entryStatusConstants';
import { MISSING_EVENT, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { positionAssignmentsOf, structuresOf } from '@Helpers/drawTopology/structureMembers';
import { CONTAINER, MAIN } from '@Constants/drawDefinitionConstants';

// types
import type { DrawDefinition, Entry, PositionAssignment, Structure } from '@Types/tournamentTypes';
import type { GenerateDrawDefinitionArgs, ResultType } from '@Types/factoryTypes';

/**
 * How a structure's positions are taken, in the order a director reads them.
 *
 *   FITS   every position is taken by an entry or a qualifier slot, or left a BYE the seeds are owed
 *   OVER   selected entries the stage had no place for
 *   SHORT  BYEs beyond the seeds' share: the draw is larger than its entries
 *   EMPTY  nothing entered yet — a draw built before registration
 *
 * ── SHORT is measured against the seeds, not against a threshold ──
 *
 * No governing body checked publishes a maximum number or proportion of BYEs (researched 2026-11-08: ATP Rulebook 2026
 * §7.18, WTA Rulebook 2026 §V.A.5.d, USTA Friend at Court II.B.4, ITF WTTJ). All of them give BYEs to the seeds first,
 * and the tours fix that share by draw size — a 96 with 32 seeds and 32 BYEs is a full draw. So the BYEs a draw's
 * seeds absorb are part of fitting it, and only the BYEs beyond them say the draw is larger than its entries. Any
 * tolerance beyond that is a provider's policy, not the engine's.
 */
export type DrawFitStatus = 'FITS' | 'OVER' | 'SHORT' | 'EMPTY';

export type StructureFit = {
  structureId: string;
  structureName?: string;
  stage?: string;
  stageSequence?: number;
  /** Every draw position, across a round robin's groups. */
  positions: number;
  placed: number;
  byes: number;
  /** The BYEs the structure's seeds absorb: the lesser of its BYEs and its seeds. */
  seedByes: number;
  /** BYEs beyond the seeds' share. */
  byesBeyondSeeds: number;
  seedsCount: number;
  qualifierSlots: number;
  /** Positions with no entry, BYE or qualifier — left open by the generator. */
  open: number;
  /** Selected entries of this structure's stage that had no place in it. */
  notPlaced: number;
  status: DrawFitStatus;
};

/** One stage's entries, grouped as the factory groups them for a draw. */
export type StageLedger = {
  /** Entries that take a position (`STRUCTURE_SELECTED_STATUSES`), by status. */
  selected: Record<string, number>;
  selectedCount: number;
  alternates: number;
  withdrawn: number;
  /** Any other status (UNGROUPED, UNPAIRED, REGISTERED, FEED_IN …), by status. */
  other: Record<string, number>;
};

export type NotPlacedEntry = { participantId: string; entryStatus?: string; entryStage?: string; reason?: string };

/** The generator's `ENTRIES_NOT_PLACED` warning, as far as the fit reads it. */
type NotPlacedWarning = { code?: string; stage?: string; entries?: NotPlacedEntry[] };

export type DrawFitResult = ResultType & {
  ledger?: Record<string, StageLedger>;
  structures?: StructureFit[];
  notPlaced?: NotPlacedEntry[];
  drawSize?: number;
};

type GetDrawFitArgs = Partial<GenerateDrawDefinitionArgs>;

/**
 * Whether an event's entries fit a draw, structure by structure — WITHOUT making it.
 *
 * Takes the draw generator's own parameters (size, type, qualifying profiles, seeds, and `drawEntries` to try a
 * different acceptance) and runs the generator, attaching nothing: the counts are the generator's own placements,
 * never a second copy of its arithmetic. Generators write nothing (they are held to the query-purity check), so this
 * reads like a query. For the topology's Fit mode and the Format Wizard (CA, 2026-11-08).
 *
 * The ledger counts the event's entries — or `drawEntries` when given — by stage: who takes a position, who waits as
 * an alternate, who has withdrawn. A structure's `notPlaced` and the top-level `notPlaced` come from the generator's
 * own `ENTRIES_NOT_PLACED` warning, so "who was left out, and why" is exactly what generation would have reported.
 */
export function getDrawFit(params: GetDrawFitArgs): DrawFitResult {
  const { tournamentRecord, event } = params;
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!event) return { error: MISSING_EVENT };

  const entries: Entry[] = params.drawEntries ?? event.entries ?? [];
  const ledger = ledgerOf(entries);

  // ── A trial acceptance goes in as the EVENT's entries, on a copy ──
  //
  // The generator answers an over-full stage two ways, by design. Entries read from `event.entries` are not promised to
  // this draw (an event can feed several draws or flights), so it places what fits and reports the rest as
  // ENTRIES_NOT_PLACED, the surplus staying on the event (`entriesNotPlaced.ts`). Explicit `drawEntries` say "these
  // are this draw's entries", so a stage that cannot hold them is refused ("No stage space available"). A fit asks
  // the first question — how would these entries fill this draw — so the trial entries are handed over the first way,
  // on a shallow copy of the event, never the event itself.
  const { drawEntries: _drawEntries, ...generationParams } = params;
  const generation = generateDrawDefinition({
    ...(generationParams as GenerateDrawDefinitionArgs),
    event: params.drawEntries ? { ...event, entries: params.drawEntries } : event,
    tournamentRecord,
  });
  if (generation.error) return { error: generation.error, ...(generation.context && { context: generation.context }) };

  const warnings = ((generation as { warnings?: unknown[] }).warnings ?? []) as NotPlacedWarning[];
  const notPlaced: NotPlacedEntry[] = warnings
    .filter((warning) => warning?.code === 'ENTRIES_NOT_PLACED')
    .flatMap((warning) =>
      (warning.entries ?? []).map((entry) => ({ ...entry, entryStage: entry.entryStage ?? warning.stage })),
    );

  const drawDefinition = (generation as { drawDefinition?: DrawDefinition }).drawDefinition;
  const structures = (drawDefinition?.structures ?? []).map((structure) => structureFit(structure, notPlaced));

  return { success: true, ledger, structures, notPlaced, drawSize: drawSizeOf(drawDefinition) };
}

function ledgerOf(entries: Entry[]): Record<string, StageLedger> {
  const ledger: Record<string, StageLedger> = {};
  for (const entry of entries) {
    const stage = entry.entryStage ?? MAIN;
    ledger[stage] ??= { selected: {}, selectedCount: 0, alternates: 0, withdrawn: 0, other: {} };
    const stageLedger = ledger[stage];
    const status = entry.entryStatus ?? 'UNKNOWN';
    if (entry.entryStatus && STRUCTURE_SELECTED_STATUSES.includes(entry.entryStatus)) {
      stageLedger.selected[status] = (stageLedger.selected[status] ?? 0) + 1;
      stageLedger.selectedCount += 1;
    } else if (status === ALTERNATE) {
      stageLedger.alternates += 1;
    } else if (status === WITHDRAWN) {
      stageLedger.withdrawn += 1;
    } else {
      stageLedger.other[status] = (stageLedger.other[status] ?? 0) + 1;
    }
  }
  return ledger;
}

function assignmentsOf(structure: Structure): PositionAssignment[] {
  if (structure.structureType === CONTAINER) {
    return (structuresOf(structure) ?? []).flatMap((group) => positionAssignmentsOf(group) ?? []);
  }
  return positionAssignmentsOf(structure) ?? [];
}

function structureFit(structure: Structure, notPlacedAll: NotPlacedEntry[]): StructureFit {
  const assignments = assignmentsOf(structure);
  const placed = assignments.filter((a) => a.participantId).length;
  const byes = assignments.filter((a) => a.bye).length;
  const qualifierSlots = assignments.filter((a) => a.qualifier && !a.participantId).length;
  const open = assignments.length - placed - byes - qualifierSlots;
  const seedsCount = structure.seedAssignments?.length ?? 0;
  const seedByes = Math.min(byes, seedsCount);
  const byesBeyondSeeds = byes - seedByes;
  // the generator reports the unplaced by stage; the first structure of the stage is where they would have gone
  const firstOfStage = (structure.stageSequence ?? 1) === 1;
  const notPlaced = firstOfStage
    ? notPlacedAll.filter((e) => (e.entryStage ?? MAIN) === (structure.stage ?? MAIN)).length
    : 0;

  let status: DrawFitStatus = 'FITS';
  if (notPlaced) status = 'OVER';
  else if (!placed && !qualifierSlots) status = 'EMPTY';
  else if (byesBeyondSeeds) status = 'SHORT';

  return {
    structureId: structure.structureId,
    structureName: structure.structureName,
    stage: structure.stage,
    stageSequence: structure.stageSequence,
    positions: assignments.length,
    placed,
    byes,
    seedByes,
    byesBeyondSeeds,
    seedsCount,
    qualifierSlots,
    open,
    notPlaced,
    status,
  };
}

function drawSizeOf(drawDefinition?: DrawDefinition): number | undefined {
  const main = drawDefinition?.structures?.find((s) => s.stage === MAIN && (s.stageSequence ?? 1) === 1);
  return main ? assignmentsOf(main).length : undefined;
}
