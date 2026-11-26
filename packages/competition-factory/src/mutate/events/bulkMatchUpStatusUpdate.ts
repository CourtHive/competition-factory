import { decideUnit, type UnitRecords } from '@Mutate/matchUps/outcome/plan/recordedUnit';
import { setMatchUpStatus } from '@Mutate/matchUps/matchUpStatus/setMatchUpStatus';
import { decorateResult } from '@Functions/global/decorateResult';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { findEvent } from '@Acquire/findEvent';
import { bulkItem } from '@Mutate/bulkItem';

// constants
import { PARTIAL_COMMIT, SUCCESS } from '@Constants/resultConstants';
import {
  DRAW_DEFINITION_NOT_FOUND,
  ErrorType,
  EVENT_NOT_FOUND,
  MATCHUP_NOT_FOUND,
  MISSING_DRAW_ID,
  MISSING_EVENT,
  MISSING_MATCHUP_ID,
  MISSING_TOURNAMENT_RECORD,
  MISSING_VALUE,
} from '@Constants/errorConditionConstants';

// types
import type { PolicyDefinitions, ResultType } from '@Types/factoryTypes';
import type { DrawDefinition, MatchUpStatusUnion, Tournament } from '@Types/tournamentTypes';

// The per-call options of setMatchUpStatus that a bulk entry carries, each settable on the call (every outcome) or
// on one outcome (that outcome only). Forwarding none of them made a result entered in bulk propagate differently
// from the same result entered singly. setMatchUpStatus still applies `policy ?? param ?? default` to the three
// propagation flags, so an applied scoring policy that speaks on a flag wins over either.
const FORWARDED_OPTIONS = [
  'propagateRetirementAsExit',
  'disableScoreValidation',
  'allowChangePropagation',
  'propagateExitStatus',
  'disableAutoCalc',
  'enableAutoCalc',
  'setTBlast',
] as const;

type ForwardedOptions = { [K in (typeof FORWARDED_OPTIONS)[number]]?: boolean };
type BulkOutcome = ForwardedOptions & {
  matchUpFormat?: string;
  tournamentId: string;
  matchUpId: string;
  eventId: string;
  drawId: string;
  notes?: string;
  schedule?: object;
  // the outcome itself, as `setMatchUpStatus` takes it
  matchUpStatus?: MatchUpStatusUnion;
  winningSide?: number;
  score?: unknown;
};
type BulkParams = ForwardedOptions & {
  tournamentRecords?: { [key: string]: Tournament };
  policyDefinitions?: PolicyDefinitions;
  tournamentRecord?: Tournament;
  outcomes?: BulkOutcome[];
};

/** what a bulk call returns for each outcome, in the order given: its committed result or its refusal */
export type BulkOutcomeResult = {
  outcomeIndex: number;
  tournamentId?: string;
  matchUpId?: string;
  eventId?: string;
  drawId?: string;
} & ({ success: true; warnings?: ResultType['warnings'] } | { error: ErrorType; info?: unknown; context?: object });

/**
 * PER-ITEM ATOMICITY. Each outcome is one unit: it is located (tournament, event, draw, matchUp),
 * planned against the record as the outcomes before it left it, and applied whole, or refused with nothing written.
 * A refused outcome does not stop the call: every outcome is attempted, in order, and `results` holds one entry per
 * outcome. An outcome applied before or after a refused one stays written. The call still returns the first refusal
 * as its own `error`, with `context.outcomeIndex` naming it, as it always has; with `rollbackOnError` the engine then
 * restores the whole call.
 */
/** what a bulk call returns: SUCCESS or its first refusal, with one result per outcome, and `committed` when one was written */
export type BulkUpdateResult = ResultType & { results?: BulkOutcomeResult[]; committed?: boolean };

// The public parameter stays untyped, as it has always been: a caller's outcome literal is never refused by its type
// (`BulkParams` describes what is read)
export function bulkMatchUpStatusUpdate(params): BulkUpdateResult {
  // a malformed envelope refuses before any outcome is looked at
  if (!params?.outcomes) return { error: MISSING_VALUE };
  if (!Array.isArray(params.outcomes)) return { error: MISSING_VALUE, info: { outcomes: params.outcomes } };

  const tournamentRecords =
    params.tournamentRecords ??
    (params.tournamentRecord ? { [params.tournamentRecord.tournamentId]: params.tournamentRecord } : {});

  // each draw's matchUp ids, read once per call: an outcome adds or removes no matchUp
  const matchUpIds = new Map<DrawDefinition, Set<string>>();
  const results: BulkOutcomeResult[] = [];
  let refusal: ResultType | undefined;
  for (const [outcomeIndex, outcome] of params.outcomes.entries()) {
    const { tournamentId, eventId, drawId, matchUpId } = outcome ?? {};
    const ids = { outcomeIndex, tournamentId, eventId, drawId, matchUpId };
    const result = bulkItem(() => outcomeItem({ params, tournamentRecords, matchUpIds, outcome: outcome ?? {} }));
    if (result.error) {
      const refused = decorateResult({ result: { ...result }, context: ids });
      refusal ??= refused;
      results.push({ ...ids, error: result.error, ...(result.info ? { info: result.info } : {}) });
    } else {
      results.push({ ...ids, success: true, ...(result.warnings ? { warnings: result.warnings } : {}) });
    }
  }

  // committed work announces itself: with rollback off the engine publishes the committed outcomes' notices
  const committed = results.some((entry) => 'success' in entry);
  if (refusal) return { ...refusal, ...(committed ? { [PARTIAL_COMMIT]: true } : {}), results };
  return { ...SUCCESS, results };
}

type ItemArgs = {
  tournamentRecords: { [key: string]: Tournament };
  matchUpIds: Map<DrawDefinition, Set<string>>;
  outcome: Partial<BulkOutcome>;
  params: BulkParams;
};

/** one outcome, located, planned and applied whole, or refused with nothing written */
function outcomeItem({ params, tournamentRecords, matchUpIds, outcome }: ItemArgs): ResultType {
  const located = locateOutcome(tournamentRecords, matchUpIds, outcome);
  if ('error' in located) return located;
  const { matchUpFormat, matchUpId, drawId, notes } = outcome as BulkOutcome;
  const call = ({ tournamentRecord, drawDefinition, event }: UnitRecords, records: { [key: string]: Tournament }) => ({
    ...forwardedOptions(params, outcome),
    tournamentRecords: records,
    policyDefinitions: params.policyDefinitions,
    schedule: outcome?.schedule,
    tournamentRecord,
    drawDefinition,
    matchUpFormat,
    matchUpId,
    outcome,
    drawId,
    notes,
    event,
  });
  return decideUnit({
    records: located,
    matchUpId,
    // v2's own decision on the stored record, as a single call makes it
    direct: (bound) => setMatchUpStatus({ ...call(located, tournamentRecords), bound }),
    // the unit planned whole on a copy, where v2 would leave the call to v1
    run: (records) =>
      setMatchUpStatus(
        call(records, { ...tournamentRecords, [records.tournamentRecord.tournamentId]: records.tournamentRecord }),
      ),
  });
}

function forwardedOptions(params: ForwardedOptions, outcome: Partial<BulkOutcome>): ForwardedOptions {
  return Object.fromEntries(FORWARDED_OPTIONS.map((key) => [key, outcome[key] ?? params[key]]));
}

/** the outcome's tournament, event, draw and matchUp; the first that is missing or not there refuses the outcome */
function locateOutcome(
  tournamentRecords: { [key: string]: Tournament },
  matchUpIds: Map<DrawDefinition, Set<string>>,
  outcome: Partial<BulkOutcome>,
): UnitRecords | { error: ErrorType } {
  const { tournamentId, eventId, drawId, matchUpId } = outcome;
  const tournamentRecord = tournamentId ? tournamentRecords[tournamentId] : undefined;
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!eventId) return { error: MISSING_EVENT };
  const { event } = findEvent({ tournamentRecord, eventId });
  if (!event) return { error: EVENT_NOT_FOUND };
  if (!drawId) return { error: MISSING_DRAW_ID };
  const drawDefinition = event.drawDefinitions?.find((drawDefinition) => drawDefinition.drawId === drawId);
  if (!drawDefinition) return { error: DRAW_DEFINITION_NOT_FOUND };
  if (!matchUpId) return { error: MISSING_MATCHUP_ID };
  if (!matchUpIds.has(drawDefinition))
    matchUpIds.set(drawDefinition, new Set(getMatchUpsMap({ drawDefinition }).drawMatchUps.map((m) => m.matchUpId)));
  if (!matchUpIds.get(drawDefinition)?.has(matchUpId)) return { error: MATCHUP_NOT_FOUND };
  return { tournamentRecord, drawDefinition, event };
}
