import { validateDrawTallyOptions } from '@Query/matchUps/roundRobinTally/drawnResults';
import { decorateResult } from '@Functions/global/decorateResult';
import { DECIDED_BY_METHODS, DECIDED_IN } from './decidedResult';
import {
  GRAPH_MEASURES,
  RATIO_MEASURES,
  SET_MEASURES,
  TALLY_MEASURES,
  V1_PRIMARY_KEYS,
  V2_MEASURES,
} from '@Query/standings/fromV1';

// constants and types
import type { RoundRobinTallyPolicy } from '@Types/roundRobinTallyPolicy';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import type { ResultType } from '@Types/factoryTypes';

type ValidateTallyPolicyArgs = {
  tallyPolicy?: RoundRobinTallyPolicy;
  /** measures beyond the round-robin ledger's that this caller's ledger carries (a season's tie-score values) */
  extraMeasures?: string[];
};

/**
 * A round-robin tally (standings) policy, checked where it is SAVED: attached to a record, or declared on a season. The
 * engine never refuses at calculation for these (spec § 5.10); a saved policy that would have been silently
 * reinterpreted (an unknown primary key fell back to matchUpsWon, K3) is refused here instead.
 */
export function validateTallyPolicy({ tallyPolicy, extraMeasures = [] }: ValidateTallyPolicyArgs): ResultType & {
  errors?: string[];
} {
  if (tallyPolicy === undefined) return { valid: true } as ResultType;
  const errors = tallyPolicyErrors(tallyPolicy, extraMeasures);
  if (errors.length) {
    return decorateResult({
      result: { error: INVALID_VALUES, info: errors[0] },
      context: { errors },
      stack: 'validateTallyPolicy',
    });
  }
  return { valid: true } as ResultType;
}

export function tallyPolicyErrors(tallyPolicy: RoundRobinTallyPolicy, extraMeasures: string[] = []): string[] {
  if (!tallyPolicy || typeof tallyPolicy !== 'object') return ['tallyPolicy must be an object'];
  const errors: string[] = [];
  const primaryKeys = [...V1_PRIMARY_KEYS, ...V2_MEASURES, ...extraMeasures];
  const measures = [...TALLY_MEASURES, ...extraMeasures];

  const { groupOrderKey, tallyDirectives, headToHead, precision, onSplit, terminal } = tallyPolicy;
  if (groupOrderKey !== undefined && !primaryKeys.includes(groupOrderKey)) {
    errors.push(`unknown groupOrderKey: ${groupOrderKey}`);
  }
  if (groupOrderKey !== undefined && GRAPH_MEASURES.includes(groupOrderKey)) {
    errors.push(
      `groupOrderKey ${groupOrderKey}: a graph measure scores opponents by the primary measure, so it cannot be one`,
    );
  }
  if (tallyDirectives !== undefined) {
    if (!Array.isArray(tallyDirectives)) errors.push('tallyDirectives must be an array');
    else {
      tallyDirectives.forEach((directive, index) => {
        if (!directive || typeof directive !== 'object') errors.push(`tallyDirectives[${index}] must be an object`);
        else {
          const known = [...measures, ...DIRECTIVE_ONLY, ...SET_MEASURES];
          if (!known.includes(directive.attribute)) {
            errors.push(`tallyDirectives[${index}]: unknown attribute ${directive.attribute}`);
          }
          errors.push(...directiveOnlyErrors(directive, index));
          errors.push(...directiveGateErrors(directive, index));
          errors.push(...setMeasureErrors(directive, index));
          if (GRAPH_MEASURES.includes(directive.attribute) && directive.idsFilter) {
            errors.push(
              `tallyDirectives[${index}]: ${directive.attribute} reads the whole table; idsFilter cannot scope it`,
            );
          }
        }
      });
    }
  }
  if (headToHead !== undefined && (headToHead === null || typeof headToHead !== 'object')) {
    errors.push('headToHead must be an object');
  }
  if (
    precision !== undefined &&
    precision !== 'EXACT' &&
    !(Number.isInteger(precision) && (precision as number) >= 0)
  ) {
    errors.push("precision must be a whole number of decimal places, or 'EXACT'");
  }
  const { denominator } = tallyPolicy;
  if (denominator !== undefined && !DENOMINATORS.includes(denominator as string)) {
    errors.push(`denominator must be one of ${DENOMINATORS.join(', ')}`);
  }

  errors.push(...crossGroupErrors(tallyPolicy.crossGroup, measures));
  errors.push(...preReduceErrors(tallyPolicy.preReduce));
  errors.push(...resultPointsErrors(tallyPolicy.resultPoints));
  if (onSplit !== undefined && !SPLIT_MODES.includes(onSplit as string)) {
    errors.push(`onSplit must be one of ${SPLIT_MODES.join(', ')}`);
  }
  if (terminal !== undefined && !TERMINAL_STEPS.includes(terminal as string)) {
    errors.push(`terminal must be one of ${TERMINAL_STEPS.join(', ')}`);
  }

  const drawOptions = validateDrawTallyOptions(tallyPolicy);
  if (drawOptions.error) errors.push(drawOptions.info as string);
  return errors;
}

const SPLIT_MODES = ['RESTART', 'CONTINUE', 'EXTRACT_ONE'];
/** directive attributes that are not ledger measures: head-to-head (RECORD or SWEEP) and an external value */
const DIRECTIVE_ONLY = ['headToHead', 'external'];
const HEAD_TO_HEAD_MODES = ['RECORD', 'SWEEP'];

function directiveOnlyErrors(directive: Record<string, unknown>, index: number): string[] {
  if (
    directive.attribute === 'headToHead' &&
    directive.mode !== undefined &&
    !HEAD_TO_HEAD_MODES.includes(directive.mode as string)
  ) {
    return [`tallyDirectives[${index}]: headToHead mode must be one of ${HEAD_TO_HEAD_MODES.join(', ')}`];
  }
  if (directive.attribute === 'external' && !(typeof directive.externalKey === 'string' && directive.externalKey)) {
    return [`tallyDirectives[${index}]: an external directive needs an externalKey`];
  }
  return [];
}

/** the directive fields only some tied-set measures read, and which */
const FIELD_READERS: Record<string, string[]> = {
  minSample: ['commonOpponents'],
  groupBy: ['groupLeader', 'recordVsGroup'],
  setKey: ['recordVsSet'],
};

/**
 * Tied-set measures are valued for the whole tied set from the whole table, so a mini-league scope (idsFilter) cannot
 * apply. Each field only some of them read is refused elsewhere, where it would be silently ignored, and required where
 * the measure cannot be read without it.
 */
function setMeasureErrors(directive: Record<string, unknown>, index: number): string[] {
  const errors: string[] = [];
  const label = `tallyDirectives[${index}]`;
  const attribute = directive.attribute as string;
  if (SET_MEASURES.includes(attribute) && directive.idsFilter) {
    errors.push(`${label}: ${attribute} reads the whole table; idsFilter cannot scope it`);
  }
  for (const [field, readers] of Object.entries(FIELD_READERS)) {
    const value = directive[field];
    const reads = readers.includes(attribute);
    if (value !== undefined && !reads) errors.push(`${label}: ${field} applies only to ${readers.join(', ')}`);
    if (!reads || field === 'minSample') continue;
    if (!(typeof value === 'string' && value)) errors.push(`${label}: ${attribute} needs a ${field}`);
  }
  const { minSample } = directive;
  if (
    attribute === 'commonOpponents' &&
    minSample !== undefined &&
    !(Number.isInteger(minSample) && (minSample as number) >= 1)
  ) {
    errors.push(`${label}: minSample must be a whole number of at least 1`);
  }
  return errors;
}

/** preReduce names the caller grouping it reduces by */
function preReduceErrors(preReduce: unknown): string[] {
  if (preReduce === undefined) return [];
  const groupBy = (preReduce as { groupBy?: unknown } | null)?.groupBy;
  return typeof groupBy === 'string' && groupBy ? [] : ['preReduce must be an object with a groupBy'];
}
const TERMINAL_STEPS = ['ADJUDICATE', 'SHARE', 'LOT'];
const PHASES = ['PROVISIONAL', 'FINAL'];
const DENOMINATORS = ['PLAYED', 'EXPECTED'];
const ZERO_DIVISIONS = ['MAX', 'ZERO', 'SKIP'];

/** crossGroup: stored measures only, so a ratio (unbounded, computed only when ordering) cannot be one */
function crossGroupErrors(crossGroup: unknown, measures: string[]): string[] {
  if (crossGroup === undefined) return [];
  if (!Array.isArray(crossGroup)) return ['crossGroup must be an array'];
  return crossGroup.flatMap((entry, index) => {
    const attribute = entry?.attribute;
    if (!measures.includes(attribute) || RATIO_MEASURES.includes(attribute) || GRAPH_MEASURES.includes(attribute)) {
      return [`crossGroup[${index}]: ${attribute} is not a stored measure`];
    }
    return [];
  });
}

/** resultPoints: ordered rules with unique ids and finite awards; a drawn rule awards `points`, a decided one both sides */
function resultPointsErrors(resultPoints: unknown): string[] {
  if (resultPoints === undefined) return [];
  const rules = (resultPoints as { rules?: unknown })?.rules;
  if (!Array.isArray(rules) || !rules.length) return ['resultPoints.rules must be a non-empty array'];
  const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
  const ids = new Set<string>();
  // a bonus only adds to what a deciding rule awarded, so a list of bonuses alone decides nothing
  const deciding = rules.some((rule) => rule?.bonus !== true);
  const listErrors = deciding ? [] : ['resultPoints.rules needs a rule that is not a bonus'];
  return listErrors.concat(
    rules.flatMap((rule, index) => {
      const label = `resultPoints.rules[${index}]`;
      const errors: string[] = [];
      if (typeof rule?.id !== 'string' || !rule.id) errors.push(`${label} needs an id`);
      else if (ids.has(rule.id)) errors.push(`${label}: duplicate id ${rule.id}`);
      else ids.add(rule.id);
      if (rule?.isDrawn) {
        if (!finite(rule.points)) errors.push(`${label}: a drawn rule needs finite points`);
      } else if (!finite(rule?.winner) || !finite(rule?.loser)) {
        errors.push(`${label}: a decided rule needs finite winner and loser points`);
      }
      if (rule?.matchUpStatuses !== undefined && !Array.isArray(rule.matchUpStatuses)) {
        errors.push(`${label}: matchUpStatuses must be an array`);
      }
      const setsOk = (rule?.loserSetsWon ?? []).every?.((n: unknown) => Number.isInteger(n) && (n as number) >= 0);
      if (rule?.loserSetsWon !== undefined && !(Array.isArray(rule.loserSetsWon) && setsOk)) {
        errors.push(`${label}: loserSetsWon must be an array of whole numbers`);
      }
      if (rule?.loserMarginAtMost !== undefined) {
        if (rule.isDrawn) errors.push(`${label}: loserMarginAtMost applies only to a decided rule`);
        else if (!finite(rule.loserMarginAtMost) || rule.loserMarginAtMost < 0)
          errors.push(`${label}: loserMarginAtMost must be a finite number of at least 0`);
      }
      if (rule?.bonus !== undefined && typeof rule.bonus !== 'boolean') {
        errors.push(`${label}: bonus must be true or false`);
      }
      return errors.concat(decidedConditionErrors(rule, label));
    }),
  );
}

/** a rule conditioned on how its result was decided: a decided rule, naming known phases or methods */
function decidedConditionErrors(rule: Record<string, unknown>, label: string): string[] {
  const known: Record<string, string[]> = { decidedIn: DECIDED_IN, decidedBy: DECIDED_BY_METHODS };
  return (['decidedIn', 'decidedBy'] as const).flatMap((key) => {
    const values = rule?.[key];
    if (values === undefined) return [];
    if (rule.isDrawn) return [`${label}: ${key} applies only to a decided rule`];
    const valid = Array.isArray(values) && values.length > 0 && values.every((value) => known[key].includes(value));
    return valid ? [] : [`${label}: ${key} must be a non-empty array of ${known[key].join(', ')}`];
  });
}

/** a directive's size and `when` gates */
function directiveGateErrors(directive: Record<string, unknown>, index: number): string[] {
  const errors: string[] = [];
  for (const key of ['minParticipants', 'maxParticipants']) {
    const value = directive[key];
    if (value !== undefined && !(Number.isInteger(value) && (value as number) >= 1)) {
      errors.push(`tallyDirectives[${index}]: ${key} must be a whole number of at least 1`);
    }
  }
  const { zeroDivision } = directive;
  if (zeroDivision !== undefined && !ZERO_DIVISIONS.includes(zeroDivision as string)) {
    errors.push(`tallyDirectives[${index}]: zeroDivision must be one of ${ZERO_DIVISIONS.join(', ')}`);
  }
  const when = directive.when as { purposes?: unknown; phase?: unknown } | undefined;
  if (when !== undefined) {
    if (!when || typeof when !== 'object') errors.push(`tallyDirectives[${index}]: when must be an object`);
    else {
      const { purposes, phase } = when;
      if (purposes !== undefined && !(Array.isArray(purposes) && purposes.every((p) => typeof p === 'string'))) {
        errors.push(`tallyDirectives[${index}]: when.purposes must be an array of strings`);
      }
      if (phase !== undefined && !PHASES.includes(phase as string)) {
        errors.push(`tallyDirectives[${index}]: when.phase must be one of ${PHASES.join(', ')}`);
      }
    }
  }
  return errors;
}
