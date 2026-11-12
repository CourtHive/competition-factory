// constants and types
import type { Event, Extension, Participant, Tournament } from './tournamentTypes';
import type { ErrorType } from '@Constants/errorConditionConstants';

export type IndividualMergeChoice = 'source' | 'target';
export type IndividualMergeResolutions = Record<string, IndividualMergeChoice>;
export type IndividualMergeBlockerCode =
  | 'SHARED_DRAW'
  | 'PAIR_COLLAPSE'
  | 'DUPLICATE_PAIR'
  | 'OPPOSING_SIDES'
  | 'DUPLICATE_LINEUP'
  | 'FLIGHT_CONFLICT'
  | 'INVALID_CONTACT_MEMBER'
  | 'PERSON_ID_CONFLICT'
  | 'ISSUED_ID_CONFLICT'
  | 'INVALID_ISSUED_ID'
  | 'ROLE_CONFLICT'
  | 'ENTRY_CONFLICT'
  | 'ENTRY_GROUPING_CONFLICT'
  | 'HISTORY_CONFLICT'
  | 'UNSUPPORTED_REFERENCE'
  | 'INVALID_RESOLUTION'
  | 'INTEGRITY_CONFLICT';
export type IndividualMergeBlocker = {
  code: IndividualMergeBlockerCode;
  path: string;
  eventId?: string;
  drawId?: string;
};
export type IndividualMergeConflict = {
  path: string;
  source: unknown;
  target: unknown;
};
export type IndividualMergeArgs = {
  tournamentRecord: Tournament;
  sourceParticipantId: string;
  targetParticipantId: string;
  resolutions?: IndividualMergeResolutions;
};
export type IndividualMergePreview = {
  success?: boolean;
  error?: ErrorType;
  canMerge?: boolean;
  fingerprint?: string;
  participant?: Participant;
  blockers?: IndividualMergeBlocker[];
  conflicts?: IndividualMergeConflict[];
  changedPaths?: string[];
  affectedDrawIds?: string[];
};
export type IndividualMergeLedger = {
  version: 1;
  aliases: Record<string, string>;
};

export type IndividualMergeSnapshot = {
  participants?: Participant[];
  events?: Event[];
  extensions?: Extension[];
  other: Record<string, unknown>;
};
export type IndividualMergeResult = IndividualMergePreview & {
  sourceParticipantId?: string;
  targetParticipantId?: string;
  context?: IndividualMergePreview;
  mergeReceipt?: {
    sourceParticipantId: string;
    targetParticipantId: string;
    resolutions: IndividualMergeResolutions;
    beforeFingerprint?: string;
    before: IndividualMergeSnapshot;
  };
};
