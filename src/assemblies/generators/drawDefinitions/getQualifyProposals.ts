import { checkSanctionedEntryLimits } from '@Query/drawDefinition/checkSanctionedEntryLimits';
import { getDrawFit } from './getDrawFit';

// constants and types
import { ALTERNATE, DIRECT_ACCEPTANCE, STRUCTURE_SELECTED_STATUSES } from '@Constants/entryStatusConstants';
import type { DrawCompositionConstraints } from '@Query/drawDefinition/getDrawCompositionConstraints';
import { MAIN, QUALIFYING, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import type { DrawFitProposal, GetDrawFitProposalsArgs } from './getDrawFitProposals';
import type { Entry } from '@Types/tournamentTypes';

const ENTRY_STAGES = new Set<string>([MAIN, QUALIFYING]);
const SELECTED = new Set(STRUCTURE_SELECTED_STATUSES);
const selected = (entry: Entry) => !!entry.entryStatus && SELECTED.has(entry.entryStatus);
export const stageEntryKey = (entry: Entry) => `${entry.entryStage ?? MAIN}:${entry.participantId}`;

/** The first real-generator solution, keeping the existing qualifying field in qualifying. */
export function getQualifyProposals(
  params: GetDrawFitProposalsArgs,
  entries: Entry[],
  ranked: Entry[],
  drawSize: number,
  constraints?: DrawCompositionConstraints,
): DrawFitProposal[] {
  if (
    (params.qualifyingProfiles?.length ?? 0) > 1 ||
    (params.qualifyingProfiles?.[0]?.structureProfiles?.length ?? 0) > 1
  )
    return [];
  const existingProfile = params.qualifyingProfiles?.[0];
  const existingStructure = existingProfile?.structureProfiles?.[0];
  if (
    (existingProfile?.roundTarget ?? 1) !== 1 ||
    (existingStructure?.drawType && existingStructure.drawType !== SINGLE_ELIMINATION)
  )
    return [];
  if (!Number.isSafeInteger(drawSize) || drawSize < 2 || drawSize > entries.length * 2) return [];
  if (constraints?.drawSize !== undefined && drawSize > constraints.drawSize) return [];
  const main = ranked.filter((entry) => (entry.entryStage ?? MAIN) === MAIN && selected(entry));
  const qualifying = entries.filter((entry) => entry.entryStage === QUALIFYING && selected(entry));
  const qualifyingIds = new Set(
    entries.filter((entry) => entry.entryStage === QUALIFYING).map((entry) => entry.participantId),
  );
  const proposals: DrawFitProposal[] = [];
  for (let slots = 1; slots <= drawSize && proposals.length < 1; slots *= 2) {
    if (constraints?.maxQualifiers !== undefined && slots > constraints.maxQualifiers) break;
    const proposal = qualifyAtSlots(params, entries, ranked, main, qualifying, qualifyingIds, drawSize, slots);
    if (proposal) proposals.push(proposal);
  }
  return proposals;
}

function qualifyAtSlots(
  params: GetDrawFitProposalsArgs,
  entries: Entry[],
  ranked: Entry[],
  main: Entry[],
  qualifying: Entry[],
  qualifyingIds: Set<string>,
  drawSize: number,
  slots: number,
): DrawFitProposal | undefined {
  const moved = main.slice(Math.max(0, drawSize - slots));
  if ((!moved.length && !qualifying.length) || moved.some((entry) => qualifyingIds.has(entry.participantId)))
    return undefined;
  const pool = qualifying.length + moved.length;
  const qualifyingDrawSize = Math.max(2, 2 ** Math.ceil(Math.log2(pool)));
  // Every qualifier must win at least one round. Never manufacture a qualifying berth from a BYE.
  if (qualifyingDrawSize < slots * 2) return undefined;
  const changes: DrawFitProposal['entryChanges'] = moved.map((entry) => ({
    participantId: entry.participantId,
    entryStage: MAIN,
    toStage: QUALIFYING,
    entryStatus: entry.entryStatus!,
  }));
  const occupied = new Set([...qualifying, ...moved].map((entry) => entry.participantId));
  const alternates = ranked.filter(
    (entry) =>
      ENTRY_STAGES.has(entry.entryStage ?? MAIN) &&
      entry.entryStatus === ALTERNATE &&
      !occupied.has(entry.participantId) &&
      ((entry.entryStage ?? MAIN) === QUALIFYING || !qualifyingIds.has(entry.participantId)),
  );
  const promoted = new Set<string>();
  // Try the given pool first (its seeds may absorb BYEs), then a pool filled by ranked alternates.
  for (const fill of [false, true]) {
    if (fill) {
      for (const entry of alternates) {
        if (promoted.size >= qualifyingDrawSize - pool) break;
        if (promoted.has(entry.participantId)) continue;
        promoted.add(entry.participantId);
        changes.push({
          participantId: entry.participantId,
          entryStage: entry.entryStage ?? MAIN,
          toStage: QUALIFYING,
          entryStatus: DIRECT_ACCEPTANCE,
        });
      }
      if (!promoted.size) break;
    }
    const fit = candidateFit(params, entries, changes, drawSize, qualifyingDrawSize, slots);
    if (!fit) continue;
    return {
      kind: 'Qualify',
      label: `Qualify: ${qualifyingDrawSize} → ${slots}`,
      drawSize,
      drawType: params.drawType ?? SINGLE_ELIMINATION,
      qualifyingPositions: slots,
      qualifyingDrawSize,
      entryChanges: [...changes],
      fit,
      consequence: {
        cutToAlternate: 0,
        byesBeyondSeeds: 0,
        fedIn: 0,
        movedToQualifying: moved.length,
        promotedAlternates: promoted.size,
      },
    };
  }
  return undefined;
}

function candidateFit(
  params: GetDrawFitProposalsArgs,
  entries: Entry[],
  changes: DrawFitProposal['entryChanges'],
  drawSize: number,
  qualifyingDrawSize: number,
  slots: number,
) {
  const byKey = new Map(changes.map((change) => [stageEntryKey(change), change]));
  const candidate = entries.map((entry) => {
    const change = byKey.get(stageEntryKey(entry));
    return change
      ? { ...entry, entryStatus: change.entryStatus, entryStage: change.toStage ?? change.entryStage }
      : { ...entry };
  });
  if (checkSanctionedEntryLimits({ ...params, entries: candidate }).error) return undefined;
  const fit = getDrawFit({
    ...params,
    drawSize,
    drawType: params.drawType ?? SINGLE_ELIMINATION,
    drawEntries: candidate,
    qualifyingProfiles: [
      {
        ...params.qualifyingProfiles?.[0],
        structureProfiles: [
          {
            ...params.qualifyingProfiles?.[0]?.structureProfiles?.[0],
            drawSize: qualifyingDrawSize,
            qualifyingPositions: slots,
          },
        ],
      },
    ],
  });
  if (
    fit.error ||
    fit.notPlaced?.length ||
    !fit.structures?.length ||
    fit.structures.some(
      (structure) =>
        ENTRY_STAGES.has(structure.stage ?? MAIN) &&
        (structure.stageSequence ?? 1) === 1 &&
        structure.status !== 'FITS',
    )
  )
    return undefined;
  return fit;
}
