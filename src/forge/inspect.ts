/**
 * engine.inspect() — typed state snapshot for debugging (developer-JOY #8)
 *
 * Returns a single, typed snapshot of "what's loaded right now": engine
 * version, write-mode flags, tournament IDs in state, lightweight counts of
 * the major collections, subscription topics, and the current devContext.
 *
 * Cheap, side-effect-free, intended for quick `console.log(engine.inspect())`
 * during debugging, paste-into-bug-report scenarios, and devtools panels.
 * Not a full state dump — counts only, no record bodies, no participants
 * payload. Use `engine.getState()` for the full picture.
 */

import {
  getAuditAuthorityServer,
  getDevContext,
  getSaveDrawDeletions,
  getSchemaWriteMode,
  getTopics,
  getTournamentId,
  getTournamentRecords,
} from '@Global/state/globalState';
import { factoryVersion } from '@Functions/global/factoryVersion';

export interface EngineInspectionCounts {
  tournaments: number;
  events: number;
  drawDefinitions: number;
  structures: number;
  matchUps: number;
  participants: number;
  venues: number;
  courts: number;
}

export interface EngineInspection {
  /** factory package version (matches engine.version()) */
  version: string;
  /** current schemaWriteMode setting */
  schemaWriteMode: string;
  /** opt-in flag for the drawDeletions audit (Phase 6) */
  saveDrawDeletions: boolean;
  /** when true the factory suppresses local drawDeletions writes — server is authority */
  auditAuthorityServer: boolean;
  /** state of the loaded tournament records */
  loaded: {
    tournamentIds: string[];
    currentTournamentId?: string;
    /** lightweight counts across all loaded records */
    counts: EngineInspectionCounts;
  };
  /** topics with at least one active subscription */
  subscriptions: {
    topics: string[];
  };
  /** current devContext (false when no dev logging is enabled) */
  devContext: any;
}

function zeroCounts(): EngineInspectionCounts {
  return {
    tournaments: 0,
    events: 0,
    drawDefinitions: 0,
    structures: 0,
    matchUps: 0,
    participants: 0,
    venues: 0,
    courts: 0,
  };
}

function countLoadedRecords(records: Record<string, any>): EngineInspectionCounts {
  const counts = zeroCounts();
  for (const record of Object.values(records ?? {})) {
    counts.tournaments += 1;
    counts.events += record?.events?.length ?? 0;
    counts.venues += record?.venues?.length ?? 0;
    counts.participants += record?.participants?.length ?? 0;
    for (const event of record?.events ?? []) {
      counts.drawDefinitions += event?.drawDefinitions?.length ?? 0;
      for (const dd of event?.drawDefinitions ?? []) {
        counts.structures += dd?.structures?.length ?? 0;
        for (const structure of dd?.structures ?? []) {
          counts.matchUps += structure?.matchUps?.length ?? 0;
        }
      }
    }
    for (const venue of record?.venues ?? []) {
      counts.courts += venue?.courts?.length ?? 0;
    }
  }
  return counts;
}

export function inspect(): EngineInspection {
  const records = getTournamentRecords() ?? {};
  const tournamentIds = Object.keys(records);
  const currentTournamentId = getTournamentId() || undefined;

  const topicsResult = getTopics();
  const topics: string[] = Array.isArray(topicsResult?.topics) ? topicsResult.topics : [];

  return {
    version: factoryVersion(),
    schemaWriteMode: getSchemaWriteMode(),
    saveDrawDeletions: getSaveDrawDeletions(),
    auditAuthorityServer: getAuditAuthorityServer(),
    loaded: {
      tournamentIds,
      currentTournamentId,
      counts: countLoadedRecords(records),
    },
    subscriptions: { topics },
    devContext: getDevContext(),
  };
}
