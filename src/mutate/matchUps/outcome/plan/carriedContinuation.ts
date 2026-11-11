import { buildCarriedExitProvenance } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';

// constants and types
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';
import { WALKOVER } from '@Constants/matchUpStatusConstants';
import type { Convergence } from './convergence';
import type { ThroughBye } from '../types';
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

/** The origin a continuation's provenance names (ruling 11). */
export type FrameLineage = { sourceMatchUpId: string; previousMatchUpStatus: MatchUpStatusUnion };

/** The loser target a seat frame serves, read once by its adapter. `at` only where the link names a whole seat. */
export type SeatTarget = {
  linked: boolean;
  at?: { structureId: string; drawPosition: number; matchUpId: string };
  linkCondition?: string;
  fed: boolean;
  opponentBye: boolean;
};

/** A double exit's loser seats, served by one dispatch over the existing builders. Stored reads come from the
 * cursor (`prefix` projected); hydrated reads come from the entry view (`snapshotAt` 0). `cascadeStatus` is the
 * status the caller passes; derived statuses read it, never the request. */
export type SeatFrame = {
  kind: 'seat';
  phase: 'source';
  originMatchUpId: string;
  cascadeStatus: MatchUpStatusUnion;
  lineage: FrameLineage;
  snapshotAt: 0;
  prefix: OutcomeOp[];
  /** the produced write the seats precede, folded before deferred replay */
  following: OutcomeOp[];
  propagatesBye: boolean;
  seat: SeatTarget;
};

export type CarryFrame = {
  kind: 'carry';
  landing: CarriedLanding;
  /** Optional: a frame with no origin builds provenance with none. */
  lineage?: Partial<FrameLineage>;
  assignment?: Omit<Extract<OutcomeOp, { op: 'assignPosition' }>, 'op'>;
  /** Existing convergence writer's terminal program, resolved with this frame's lineage. */
  convergence?: OutcomeOp[];
};

/** One frame type for every continuation; not an executor, never persisted, never a deduplication key. */
export type ContinuationFrame = SeatFrame | CarryFrame;

/** One carried origin, through BYE relays, an award or convergence, and onward loser links.
 * The first relay remains separate: immediate callers place the carrier beyond its BYEs before
 * landing; deferred callers already placed it and append the whole continuation after that prefix.
 * Produced exits have different result writes and notice contracts and do not enter this writer. */
export function carriedContinuation(
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
    if (frame.assignment) {
      landing.push({ op: 'assignPosition', ...frame.assignment, announcesAssignments: false });
    }
    const relays = (at.relays ?? []).flatMap(({ matchUpId, sideNumber }): OutcomeOp[] => [
      ...carryProvenance(status, frame!, matchUpId, sideNumber, 'progressExitStatus'),
      { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUpId },
    ]);
    if (!frame.assignment) (frame === first ? relay : landing).push(...relays);
    if (frame !== first && at.beyond) landing.push(...carryPlacement(at.beyond, true));
    if (frame.assignment)
      landing.push({ op: 'announcePositionAssignments', structureId: frame.assignment.structureId }, ...relays);
    landing.push(...carryLanding(status, frame));
    if (!at.carriesOn) return { relay, landing };
    frame = next?.(frame);
  }
  return undefined;
}

function carryPlacement(at: { matchUpId: string; drawPositions: number[] }, preservesWinningSide?: true): OutcomeOp[] {
  return [
    {
      op: 'setMatchUpDrawPositions',
      matchUpId: at.matchUpId,
      drawPositions: at.drawPositions,
      ...(preservesWinningSide ? { preservesWinningSide } : {}),
    },
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
    previousMatchUpStatus: frame.lineage?.previousMatchUpStatus,
    sourceMatchUpId: frame.lineage?.sourceMatchUpId,
    matchUpStatus: status,
    exitingSideNumber,
  });
  // Immediate readers certify the side. Deferred replay historically emits this op even
  // for an invalid certificate; preserving its field is different from silently omitting it.
  return [
    { op: 'mergeSideExitProvenance', matchUpId, provenance: provenance!, ...(announcedAs ? { announcedAs } : {}) },
  ];
}

function carryLanding(status: MatchUpStatusUnion, frame: CarryFrame): OutcomeOp[] {
  const { landing: at } = frame;
  if (frame.convergence) return frame.convergence;
  if (at.ends) return [];
  return [
    {
      op: 'setMatchUpResult',
      matchUpId: at.matchUpId,
      matchUpStatus: status,
      winningSide: (3 - at.sideNumber) as 1 | 2,
      matchUpStatusCodes: [],
      ...(status === WALKOVER ? { resetsScore: true, score: toBePlayed.score } : {}),
      ...('ensuredSides' in at ? { ensuredSides: at.ensuredSides } : {}),
    },
    ...carryProvenance(status, frame, at.matchUpId, at.sideNumber),
    { op: 'stampUpdatedAt', entity: 'matchUp', id: at.matchUpId },
    ...(at.onward ? carryPlacement(at.onward) : []),
  ];
}
