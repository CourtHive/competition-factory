import { buildCarriedExitProvenance } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { convergenceOps } from './convergence';

// constants and types
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';
import { WALKOVER } from '@Constants/matchUpStatusConstants';
import type { OutcomeView, ThroughBye } from '../types';
import type { Convergence } from './convergence';
import type { OutcomeOp } from '../ops';

export type CarriedLanding = {
  matchUpId: string;
  sideNumber: 1 | 2;
  carriesOn: boolean;
  opponentHeld: boolean;
  onward?: { matchUpId: string; drawPositions: number[] };
  relays?: { matchUpId: string; sideNumber: number | undefined }[];
  beyond?: ThroughBye;
  ends?: boolean;
  /** Immediate propagation counts each BYE passed and each landing written. */
  passes: number;
  converged?: Convergence;
  ensuredSides?: unknown[];
};

export type CarryFrame = {
  landing: CarriedLanding;
  sourceMatchUpId?: string;
  previousMatchUpStatus?: MatchUpStatusUnion;
  assignment?: Omit<Extract<OutcomeOp, { op: 'assignPosition' }>, 'op'>;
};

/** One carried origin, through BYE relays, an award or convergence, and onward loser links.
 * The first relay remains separate: immediate callers place the carrier beyond its BYEs before
 * landing; deferred callers already placed it and append the whole continuation after that prefix.
 * Produced exits have different result writes and notice contracts and do not enter this writer. */
export function carriedContinuation(
  view: OutcomeView,
  status: MatchUpStatusUnion,
  first: CarryFrame,
  next?: (frame: CarryFrame) => CarryFrame | undefined,
  maxPasses?: number,
): { relay: OutcomeOp[]; landing: OutcomeOp[] } | undefined {
  const relay: OutcomeOp[] = [];
  const landing: OutcomeOp[] = [];
  let frame: CarryFrame | undefined = first;
  let passes = 0;
  while (frame) {
    const at = frame.landing;
    passes += at.passes;
    if (maxPasses !== undefined && passes > maxPasses) return undefined;
    if (frame.assignment) landing.push({ op: 'assignPosition', ...frame.assignment });
    const relays = (at.relays ?? []).flatMap(({ matchUpId, sideNumber }): OutcomeOp[] => [
      ...carryProvenance(status, frame!, matchUpId, sideNumber, 'progressExitStatus'),
      { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUpId },
    ]);
    (frame === first ? relay : landing).push(...relays);
    if (frame !== first && at.beyond) landing.push(...carryPlacement(at.beyond));
    landing.push(...carryLanding(view, status, frame));
    if (!at.carriesOn) return { relay, landing };
    frame = next?.(frame);
  }
  return undefined;
}

function carryPlacement(at: { matchUpId: string; drawPositions: number[] }): OutcomeOp[] {
  return [
    { op: 'setMatchUpDrawPositions', matchUpId: at.matchUpId, drawPositions: at.drawPositions },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: at.matchUpId },
  ];
}

function carryProvenance(
  status: MatchUpStatusUnion,
  frame: CarryFrame,
  matchUpId: string,
  exitingSideNumber?: number,
  announcedAs?: 'progressExitStatus',
): OutcomeOp[] {
  const provenance = buildCarriedExitProvenance({
    previousMatchUpStatus: frame.previousMatchUpStatus,
    sourceMatchUpId: frame.sourceMatchUpId,
    matchUpStatus: status,
    exitingSideNumber,
  });
  // Immediate readers certify the side. Deferred replay historically emits this op even
  // for an invalid certificate; preserving its field is different from silently omitting it.
  return [
    { op: 'mergeSideExitProvenance', matchUpId, provenance: provenance!, ...(announcedAs ? { announcedAs } : {}) },
  ];
}

function carryLanding(view: OutcomeView, status: MatchUpStatusUnion, frame: CarryFrame): OutcomeOp[] {
  const { landing: at, sourceMatchUpId, previousMatchUpStatus } = frame;
  if (at.converged) return convergenceOps(view, at.converged, status, sourceMatchUpId, previousMatchUpStatus);
  if (at.ends) return [];
  return [
    {
      op: 'setMatchUpResult',
      matchUpId: at.matchUpId,
      matchUpStatus: status,
      winningSide: (3 - at.sideNumber) as 1 | 2,
      matchUpStatusCodes: [],
      ...(status === WALKOVER ? { score: { scoreStringSide1: '', scoreStringSide2: '' } } : {}),
      ...('ensuredSides' in at ? { ensuredSides: at.ensuredSides } : {}),
    },
    ...carryProvenance(status, frame, at.matchUpId, at.sideNumber),
    { op: 'stampUpdatedAt', entity: 'matchUp', id: at.matchUpId },
    ...(at.onward ? carryPlacement(at.onward) : []),
  ];
}
