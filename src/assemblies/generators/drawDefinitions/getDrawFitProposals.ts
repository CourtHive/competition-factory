import { getDrawCompositionConstraints } from '@Query/drawDefinition/getDrawCompositionConstraints';
import { checkSanctionedEntryLimits } from '@Query/drawDefinition/checkSanctionedEntryLimits';
import { getQualifyProposals, stageEntryKey } from './getQualifyProposals';
import { feedInMatchUps } from './feedInMatchUps';
import { getDrawFit } from './getDrawFit';

// constants and types
import { FEED_IN, MAIN, QUALIFYING, ROUND_ROBIN, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { INVALID_VALUES, MISSING_EVENT, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { STRUCTURE_SELECTED_STATUSES, ALTERNATE, QUALIFIER } from '@Constants/entryStatusConstants';
import type { Entry, EntryStatusUnion, StageTypeUnion } from '@Types/tournamentTypes';
import type { GenerateDrawDefinitionArgs, ResultType } from '@Types/factoryTypes';
import type { DrawFitResult, StructureFit } from './getDrawFit';

export type DrawFitProposal = {
  kind: 'Cut' | 'Grow' | 'Feed-in' | 'Qualify';
  qualifyingPositions?: number;
  qualifyingDrawSize?: number;
  label: string;
  drawSize: number;
  drawType: NonNullable<GenerateDrawDefinitionArgs['drawType']>;
  entryChanges: {
    participantId: string;
    entryStatus: EntryStatusUnion;
    entryStage: StageTypeUnion;
    toStage?: StageTypeUnion;
  }[];
  fit: DrawFitResult;
  consequence: {
    cutToAlternate: number;
    byesBeyondSeeds: number;
    fedIn: number;
    movedToQualifying?: number;
    promotedAlternates?: number;
  };
};

export type GetDrawFitProposalsArgs = Partial<GenerateDrawDefinitionArgs> & {
  /** Best first. Supplies ordering, never changes an entry's stage/status. Defaults to the existing entry order. */
  rankedEntries?: Entry[];
};
export type DrawFitProposalsResult = ResultType & { proposals?: DrawFitProposal[] };

const SELECTED = new Set(STRUCTURE_SELECTED_STATUSES);
const primaryMain = (fit: DrawFitResult) =>
  fit.structures?.find((structure) => structure.stage === MAIN && (structure.stageSequence ?? 1) === 1);
const selected = (entry: Entry) => !!entry.entryStatus && SELECTED.has(entry.entryStatus);

function entryStagesFit(fit: DrawFitResult): boolean {
  const fields = (fit.structures ?? []).filter(
    (structure) => [MAIN, QUALIFYING].includes(structure.stage ?? MAIN) && (structure.stageSequence ?? 1) === 1,
  );
  return fields.length > 0 && fields.every((structure) => structure.status === 'FITS');
}

/** Pure, bounded candidate search. Counts and placements are always the real generator's getDrawFit result. */
export function getDrawFitProposals(params: GetDrawFitProposalsArgs): DrawFitProposalsResult {
  const { event, tournamentRecord, rankedEntries, ...rest } = params;
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!event) return { error: MISSING_EVENT };
  const resolution = getDrawCompositionConstraints({
    tournamentRecord,
    event,
    constraintOverrides: params.constraintOverrides,
  });
  if (resolution.error) return { error: resolution.error };
  const constraints = resolution.constraints;
  const entries = params.drawEntries ?? event.entries ?? [];
  const main = entries.filter((entry) => (entry.entryStage ?? MAIN) === MAIN && selected(entry));
  if (!main.length) return { success: true, proposals: [] };
  const rankedIds = (rankedEntries ?? entries).map(stageEntryKey);
  const ranks = new Map(rankedIds.map((id, index) => [id, index]));
  if (ranks.size !== rankedIds.length || main.some((entry) => !ranks.has(stageEntryKey(entry))))
    return { error: INVALID_VALUES };
  const rankedMain = main.toSorted((a, b) => ranks.get(stageEntryKey(a))! - ranks.get(stageEntryKey(b))!);
  const generation = { ...rest, event, tournamentRecord };
  const current = getDrawFit(generation);
  if (current.error) return { error: current.error };
  const initial = primaryMain(current);
  if (!initial) return { success: true, proposals: [] };
  const qualifyingField = entries.some((entry) => entry.entryStage === QUALIFYING && selected(entry));
  const qualifyingRepresented = current.structures?.some((structure) => structure.stage === QUALIFYING);
  // A fitting MAIN alone does not account for an existing qualifying field.
  if (entryStagesFit(current) && !current.notPlaced?.length && (!qualifyingField || qualifyingRepresented))
    return { success: true, proposals: [] };

  const drawType = params.drawType ?? SINGLE_ELIMINATION;
  const count = main.length + initial.qualifierSlots;
  const sizes = standardSizes(count, drawType === ROUND_ROBIN ? (params.structureOptions?.groupSize ?? 4) : undefined);
  if (!sizes) return { error: INVALID_VALUES };
  const proposals: DrawFitProposal[] = [];
  const evaluate = (kind: DrawFitProposal['kind'], drawSize: number, candidateType = drawType) => {
    const cutCount = kind === 'Cut' ? Math.max(0, count - drawSize) : 0;
    if (
      (kind === 'Cut' && !cutCount) ||
      (kind === 'Grow' && drawSize <= initial.positions && candidateType === drawType)
    )
      return;
    const removed = new Set(rankedMain.slice(rankedMain.length - cutCount).map((entry) => entry.participantId));
    const candidateEntries = entries.map((entry): Entry =>
      (entry.entryStage ?? MAIN) === MAIN && removed.has(entry.participantId)
        ? { ...entry, entryStatus: ALTERNATE }
        : { ...entry },
    );
    if (constraints?.drawSize !== undefined && drawSize > constraints.drawSize) return;
    // Do not let generator escape hatches bypass event sanctioning; reuse its actual per-stage entry validator.
    if (
      checkSanctionedEntryLimits({
        tournamentRecord,
        event,
        entries: candidateEntries,
        constraintOverrides: params.constraintOverrides,
      }).error
    )
      return;
    const fit = getDrawFit({ ...generation, drawEntries: candidateEntries, drawSize, drawType: candidateType });
    const structure = primaryMain(fit);
    if (fit.error || !structure || fit.notPlaced?.length || structure.status === 'EMPTY' || structure.status === 'OVER')
      return;
    if (
      constraints?.maxQualifiers !== undefined &&
      qualifierCount(candidateEntries, structure) > constraints.maxQualifiers
    )
      return;
    // Grow is a director's trade-off, with extra BYEs visible. Cut/Feed-in must actually fit.
    if (kind !== 'Grow' && !entryStagesFit(fit)) return;
    const fedIn = kind === 'Feed-in' ? fedInCount(drawSize) : 0;
    if (kind === 'Feed-in' && !fedIn) return;
    proposals.push({
      kind,
      label: `${kind}: ${drawSize}`,
      drawSize,
      drawType: candidateType,
      entryChanges: rankedMain
        .filter((entry) => removed.has(entry.participantId))
        .map((entry) => ({ participantId: entry.participantId, entryStatus: ALTERNATE, entryStage: MAIN })),
      fit,
      consequence: { cutToAlternate: removed.size, byesBeyondSeeds: structure.byesBeyondSeeds, fedIn },
    });
  };
  evaluate('Cut', sizes.cutSize);
  evaluate('Grow', sizes.growSize);
  if (drawType !== ROUND_ROBIN) evaluate('Feed-in', count, FEED_IN);
  const ranked = entries.toSorted(
    (a, b) => (ranks.get(stageEntryKey(a)) ?? rankedIds.length) - (ranks.get(stageEntryKey(b)) ?? rankedIds.length),
  );
  const currentStandard = standardSizes(
    initial.positions,
    drawType === ROUND_ROBIN ? (params.structureOptions?.groupSize ?? 4) : undefined,
  );
  const qualifySize =
    initial.status === 'FITS' && currentStandard?.cutSize === initial.positions ? initial.positions : sizes.cutSize;
  proposals.push(...getQualifyProposals(params, entries, ranked, qualifySize, constraints));
  return { success: true, proposals };
}

function standardSizes(count: number, groupSize?: number): { cutSize: number; growSize: number } | undefined {
  if (groupSize !== undefined) {
    if (!Number.isInteger(groupSize) || groupSize < 2) return undefined;
    return {
      cutSize: Math.max(groupSize, Math.floor(count / groupSize) * groupSize),
      growSize: Math.ceil(count / groupSize) * groupSize,
    };
  }
  return {
    cutSize: Math.max(2, 2 ** Math.floor(Math.log2(count))),
    growSize: Math.max(2, 2 ** Math.ceil(Math.log2(count))),
  };
}

function qualifierCount(entries: Entry[], structure: StructureFit): number {
  return (
    structure.qualifierSlots +
    entries.filter((entry) => (entry.entryStage ?? MAIN) === MAIN && entry.entryStatus === QUALIFIER).length
  );
}

/** Read fed positions from the generator's actual geometry, not a second feed-in formula. */
function fedInCount(drawSize: number): number {
  const { matchUps } = feedInMatchUps({ drawSize });
  const all = new Set(matchUps.flatMap((matchUp) => matchUp.drawPositions ?? []));
  const first = new Set(
    matchUps.filter((matchUp) => matchUp.roundNumber === 1).flatMap((matchUp) => matchUp.drawPositions ?? []),
  );
  return all.size - first.size;
}
