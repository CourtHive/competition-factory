import type { RotatingPartnerStatusTreatment } from './rotatingPartnerTally';
import type { MatchUpStatusUnion, Score } from './tournamentTypes';

export type RotatingPartnerSettlementOutcome = {
  matchUpStatus: MatchUpStatusUnion;
  winningSide?: number;
  score?: Score;
};

/** Append-only adjudication of tally attribution, never a sporting-result override. */
export type RotatingPartnerSettlement = {
  version: 1;
  requestId: string;
  matchUpId: string;
  roundNumber: number;
  expectedOutcome: RotatingPartnerSettlementOutcome;
  treatment: RotatingPartnerStatusTreatment;
  reason: string;
  recordedBy: string;
  recordedAt: string;
  supersedesRequestId?: string;
};
