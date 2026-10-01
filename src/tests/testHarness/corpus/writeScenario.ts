import { getInvariantViolations } from '../exitPropagation/invariants';
import { factoryVersion } from '@Functions/global/factoryVersion';
import { getSchemaWriteMode } from '@Global/state/globalState';
import { canonicalHash, canonicalObject } from './hash';
import { generatePatch } from '../../../forge/jsonPatch';
import tournamentEngine from '@Engines/syncEngine';
import { setRandomSource } from '@Tools/prng';
import { setClock } from '@Tools/clock';
import addFormats from 'ajv-formats';
import Ajv from 'ajv';
import fs from 'fs';

export type Directive = { method: string; params: Record<string, unknown> };

export type WriteScenarioArgs = {
  scenarioId: string;
  source: { kind: string; ref: string };
  seed: number;
  clock: string;
  tags?: string[];
  knownFailure?: string;
  initialRecord: any;
  directives: Directive[];
  invariants?: string[];
  properties?: string[];
};

export class CorpusWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CorpusWriteError';
  }
}

const corpusSchema = JSON.parse(fs.readFileSync('./corpus/corpus.schema.json', { encoding: 'utf8' }));
const tournamentSchema = JSON.parse(
  fs.readFileSync('./src/global/schema/tournament.schema.json', { encoding: 'utf8' }),
);

const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
const validateScenario = ajv.compile(corpusSchema);

const recordAjv = new Ajv({ allowUnionTypes: true, allErrors: true });
recordAjv.addFormat('date-time', (dateTime: any) => !Number.isNaN(Date.parse(dateTime)));
addFormats(recordAjv);
const validateRecord = recordAjv.compile(tournamentSchema);

function coordinatesFor(matchUpId: unknown, record: any) {
  if (typeof matchUpId !== 'string') return undefined;
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const matchUp = matchUps.find((m: any) => m.matchUpId === matchUpId);
  if (!matchUp) return undefined;
  const eventIndex = record.events?.findIndex((e: any) => e.eventId === matchUp.eventId);
  const drawIndex = record.events?.[eventIndex]?.drawDefinitions?.findIndex((d: any) => d.drawId === matchUp.drawId);
  return {
    ...(eventIndex >= 0 ? { eventIndex } : {}),
    ...(drawIndex >= 0 ? { drawIndex } : {}),
    structureName: matchUp.structureName,
    roundNumber: matchUp.roundNumber,
    roundPosition: matchUp.roundPosition,
  };
}

function violationsAcross(record: any, rules: string[]): string[] {
  const found: string[] = [];
  for (const event of record.events ?? []) {
    for (const drawDefinition of event.drawDefinitions ?? []) {
      const { matchUps } = tournamentEngine.allDrawMatchUps({ drawId: drawDefinition.drawId });
      for (const v of getInvariantViolations({ matchUps, drawDefinition })) {
        if (rules.includes(v.rule)) found.push(`${v.rule}: ${v.detail}`);
      }
    }
  }
  return found;
}

/**
 * Write one corpus scenario by running `directives` through the sync engine from `initialRecord`.
 *
 * The engine is seeded and its clock fixed for the whole run, so the scenario can be regenerated
 * byte-for-byte; both hooks are reset before returning. Every step records what the engine
 * returned, the RFC 6902 patch from the previous canonical state, and the SHA-256 of the canonical
 * state after. The initial record is validated against tournament.schema.json and the result
 * against corpus.schema.json; either failing is a thrown error, never a scenario with a hole in it.
 * A claimed invariant that is violated after any step is refused unless `knownFailure` names the
 * tracker entry that owns it.
 */
export function writeScenario(args: WriteScenarioArgs) {
  const { scenarioId, source, seed, clock, tags, knownFailure, initialRecord, directives } = args;
  const invariants = args.invariants ?? [];
  const properties = args.properties ?? [];

  setRandomSource(seed);
  setClock(clock);
  try {
    tournamentEngine.reset();
    const setResult = tournamentEngine.setState(initialRecord);
    if (setResult?.error) throw new CorpusWriteError(`setState refused: ${JSON.stringify(setResult.error)}`);

    let state = canonicalObject<any>(tournamentEngine.getTournament().tournamentRecord);
    if (!validateRecord(state)) {
      throw new CorpusWriteError(
        `initial record fails tournament.schema.json: ${recordAjv.errorsText(validateRecord.errors)}`,
      );
    }
    const initial = { record: state, hash: canonicalHash(state) };
    const violated = violationsAcross(state, invariants);
    if (violated.length && !knownFailure) throw new CorpusWriteError(`initial state violates: ${violated.join('; ')}`);

    const steps: any[] = [];
    for (const directive of directives) {
      const coordinates = coordinatesFor(directive.params?.matchUpId, state);
      const outcome: any = tournamentEngine.executionQueue([{ method: directive.method, params: directive.params }]);
      const result = outcome?.error
        ? {
            error: outcome.error.code ?? String(outcome.error),
            ...(outcome.context ? { context: canonicalObject(outcome.context) } : {}),
          }
        : { success: true };
      const next = canonicalObject<any>(tournamentEngine.getTournament().tournamentRecord);
      const patch = generatePatch(state, next);
      const hash = canonicalHash(next);
      const violatedNow = violationsAcross(next, invariants);
      if (violatedNow.length && !knownFailure) {
        throw new CorpusWriteError(`after ${directive.method} (step ${steps.length}): ${violatedNow.join('; ')}`);
      }
      steps.push({ directive, ...(coordinates ? { coordinates } : {}), result, patch, hash });
      state = next;
    }

    const scenario = {
      corpusVersion: 1,
      factoryVersion: factoryVersion(),
      schemaWriteMode: getSchemaWriteMode(),
      canonicalization: 'RFC8785',
      scenarioId,
      source,
      seed,
      clock,
      ...(tags?.length ? { tags } : {}),
      ...(knownFailure ? { knownFailure } : {}),
      initial,
      steps,
      invariants,
      properties,
    };
    if (!validateScenario(scenario)) {
      throw new CorpusWriteError(`scenario fails corpus.schema.json: ${ajv.errorsText(validateScenario.errors)}`);
    }
    return scenario;
  } finally {
    setRandomSource();
    setClock();
  }
}
