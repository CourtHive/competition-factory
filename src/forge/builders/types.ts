/**
 * Shared types for the fluent builders (developer-JOY #6).
 *
 * Kept separate from the builder implementations to keep cognitive complexity
 * low in each file and to give consumers a single import surface for the
 * types they want to reference at API boundaries.
 */

import type { ErrorType } from '@Constants/errorConditionConstants';
import type { Directives } from '@Types/factoryTypes';

export type GenderInput = 'MALE' | 'FEMALE' | 'MIXED' | 'ANY' | 'OTHER';

export interface EventSeed {
  eventName?: string;
  eventLevel?: string;
  category?: {
    categoryName?: string;
    ageCategoryCode?: string;
    ratingType?: string;
    ratingMin?: number;
    ratingMax?: number;
  };
  startDate?: string;
  endDate?: string;
}

export interface DrawOpts {
  drawType?: string;
  drawName?: string;
  seedsCount?: number;
  matchUpFormat?: string;
  automated?: boolean | { seedsOnly: boolean };
  qualifyingProfiles?: any[];
  withPlayoffs?: any;
  drawEntries?: any[];
}

export interface EntriesOpts {
  entryStage?: string;
  entryStatus?: string;
  /** Skip the default `enforceGender: true` check on the underlying addEventEntries. */
  enforceGender?: boolean;
  /** Skip the default `enforceCategory: false` check on the underlying addEventEntries. */
  enforceCategory?: boolean;
}

export interface BuildResult {
  success: boolean;
  error?: ErrorType;
  eventId: string;
  drawIds: string[];
  directives: Directives;
  /** Pass-through of executionQueue's per-directive results array. */
  results?: any[];
}

export interface ParticipantBuildResult {
  success: boolean;
  error?: ErrorType;
  participantId: string;
  directives: Directives;
  results?: any[];
}

export interface PersonInput {
  givenName: string;
  familyName: string;
  sex?: 'M' | 'F' | 'X';
  nationalityCode?: string;
  personId?: string;
}
