import type { RotatingPartnerScoreContract } from './rotatingPartnerScoring';

/** Applied-round provenance, separate from competitionProfile configuration. */
export type RotatingPartnerRoundRecord = {
  version: 1;
  requestId: string;
  roundNumber: number;
  structureId: string;
  format: 'AMERICANO' | 'MEXICANO';
  algorithmVersion: 1;
  baseSeed: number;
  seedUsed: number;
  participantIds: string[];
  matchUpIds: string[];
  pairings: [[string, string], [string, string]][];
  scoringContract: RotatingPartnerScoreContract;
  sourceFingerprint: string;
};
