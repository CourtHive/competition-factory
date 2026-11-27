import { handleCaughtError, deleteNotices, setDevContext, setDeepCopy, getDevContext } from '@Global/state/globalState';
import { seedRandomParam } from '@Assemblies/engines/parts/seedRandomParam';
import * as simulationGovernor from '@Assemblies/governors/simulationGovernor';
import * as mocksGovernor from '@Assemblies/governors/mocksGovernor';
import { notifySubscribers } from '@Global/state/notifySubscribers';
import { createDerivedRandom, withRandomSource } from '@Tools/prng';
import { factoryVersion } from '@Functions/global/factoryVersion';
import { withCapturedClock } from '@Tools/clock';

import { setState } from '@Assemblies/engines/parts/stateMethods';
import { FactoryEngine } from '@Types/factoryTypes';
import type { completeDrawMatchUps } from '@Generators/simulation/completeDrawMatchUps';
import type { GenerateTournamentRecordResult } from '@Generators/mocks/generateTournamentRecord';
import type { ModifyTournamentRecordResult } from '@Generators/mocks/modifyTournamentRecord';
import type { generateOutcomeFromScoreString } from '@Scoring/parse/outcomeFromScoreString';
import type { generateEventWithDraw } from '@Generators/mocks/generateEventWithDraw';
import type { HydratedParticipant } from '@Types/hydrated';
import type { ResultType } from '@Types/factoryTypes';
import type { generateSeason } from '@Generators/mocks/generateSeason';
import type {
  AnonymizeTournamentRecordArgs,
  GenerateTournamentRecordArgs,
  ModifyTournamentRecordArgs,
  CompleteDrawMatchUpsArgs,
  GenerateParticipantsArgs,
  GenerateOutcomeArgs,
  MockSeasonProfile,
} from '@Types/mocksTypes';

let devContextSet = false;

/** A generated participant: its person may carry the country details `withIOC` / `withISO2` add. */
type GeneratedParticipant = HydratedParticipant & {
  person?: HydratedParticipant['person'] & {
    iso2NationalityCode?: string;
    iocNationalityCode?: string;
    countryName?: string;
  };
};

type GenerateParticipantsResult = ResultType & { participants: GeneratedParticipant[] };

/**
 * The typed surface: each generation method's params are a closed type, so a misplaced or misspelled
 * option is a compile error at the call site. Results are typed as succeeding: the mocks engine is test and
 * development tooling, so a generated record, its ids and an outcome are declared present. A refusal still returns
 * `{ error }` at runtime, and `error` stays readable on every result.
 */
export type MocksEngine = FactoryEngine & {
  generateTournamentRecord: (params?: GenerateTournamentRecordArgs) => GenerateTournamentRecordResult;
  generateSeason: (params: { seasonProfile: MockSeasonProfile }) => ReturnType<typeof generateSeason>;
  modifyTournamentRecord: (params?: ModifyTournamentRecordArgs) => ModifyTournamentRecordResult;
  completeDrawMatchUps: (params: CompleteDrawMatchUpsArgs) => ReturnType<typeof completeDrawMatchUps>;
  generateParticipants: (params?: GenerateParticipantsArgs) => GenerateParticipantsResult;
  generateOutcomeFromScoreString: typeof generateOutcomeFromScoreString;
  generateEventWithDraw: typeof generateEventWithDraw;
  generateOutcome: (params?: GenerateOutcomeArgs) => any;
  anonymizeTournamentRecord: (params?: AnonymizeTournamentRecordArgs) => any;
};

export const mocksEngine: MocksEngine = (() => {
  const engine: FactoryEngine = {
    version: () => factoryVersion(),
    setDeepCopy: (deepCopyOption, deepCopyAttributes) => {
      setDeepCopy(deepCopyOption, deepCopyAttributes);
      return engine;
    },
    devContext: (isDev) => {
      setDevContext(isDev);
      devContextSet = true;
      return engine;
    },
  };

  // simulationGovernor is mounted so that mocksEngine.generateOutcome, generateOutcomeFromScoreString and
  // completeDrawMatchUps survive the removal of their mocksGovernor aliases at 8.0.0: the names are part of the
  // MocksEngine surface, and a caller moved to the bare governor would lose this engine's nonRandom seeding.
  // Mounted first, so mocksGovernor's own keys win where the two governors share one.
  importGovernors([simulationGovernor, mocksGovernor]);

  return engine as MocksEngine;

  // enable Middleware
  function engineInvoke(method, params, unthreadedSource?: () => number) {
    try {
      // one instant per generation, captured before anything is written; see tools/clock.ts. And a
      // seeded call's unthreaded draws come from a stream derived from its seed; see tools/prng.ts
      return withRandomSource(unthreadedSource, () =>
        withCapturedClock(() => {
          const generated = method({ ...params });
          if (!generated?.error) notifySubscribers();
          return generated;
        }),
      );
    } finally {
      // in finally so that a throw (rethrown under devContext) cannot leave notices or an
      // invocation-scoped devContext behind for the next, unrelated call
      deleteNotices();
      if (devContextSet) {
        setDevContext(false);
        devContextSet = false;
      }
    }
  }

  function importGovernors(governors) {
    governors.forEach((governor) => {
      Object.keys(governor).forEach((method) => {
        engine[method] = createEngineMethod(governor, method);
      });
    });
  }

  function createEngineMethod(governor, method) {
    return (params) => {
      // derived BEFORE seedRandomParam consumes the seed: what nonRandom reaches through `random` is
      // unchanged, and every draw it did not reach now comes from this stream instead of the process's
      const unthreadedSource =
        typeof params?.nonRandom === 'number' ? createDerivedRandom(params.nonRandom, 'unthreaded') : undefined;
      if (typeof params?.nonRandom === 'number') params = seedRandomParam({ ...params });
      // read before invoking: the invocation resets an invocation-scoped devContext
      const rethrow = getDevContext();
      try {
        const invocationResult = engineInvoke(governor[method], params, unthreadedSource);
        if (!invocationResult?.error && params?.setState && invocationResult?.tournamentRecord) {
          // a refused install is the caller's failure too: the record they asked for is not in state
          const installed = setState(invocationResult.tournamentRecord);
          if (installed?.error) return installed;
        }
        return invocationResult;
      } catch (err) {
        if (rethrow) throw err;
        // the same contract as the other engines: a structured error, never `undefined`
        return handleCaughtError({ engineName: 'mocksEngine', methodName: method, params: params ?? {}, err });
      }
    };
  }
})();

export default mocksEngine;
