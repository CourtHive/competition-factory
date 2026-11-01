import { handleCaughtError, deleteNotices, setDevContext, setDeepCopy, getDevContext } from '@Global/state/globalState';
import { seedRandomParam } from '@Assemblies/engines/parts/seedRandomParam';
import * as mocksGovernor from '@Assemblies/governors/mocksGovernor';
import { notifySubscribers } from '@Global/state/notifySubscribers';
import { createDerivedRandom, withRandomSource } from '@Tools/prng';
import { factoryVersion } from '@Functions/global/factoryVersion';
import { withCapturedClock } from '@Tools/clock';

import { setState } from '@Assemblies/engines/parts/stateMethods';
import { FactoryEngine } from '@Types/factoryTypes';
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

/**
 * The typed surface: each generation method's params are a closed type, so a misplaced or misspelled
 * option is a compile error at the call site. Results stay untyped for now (a result is a success or an
 * error envelope, and every existing caller destructures it directly).
 */
export type MocksEngine = FactoryEngine & {
  generateTournamentRecord: (params?: GenerateTournamentRecordArgs) => any;
  generateSeason: (params: { seasonProfile: MockSeasonProfile }) => any;
  modifyTournamentRecord: (params?: ModifyTournamentRecordArgs) => any;
  completeDrawMatchUps: (params: CompleteDrawMatchUpsArgs) => any;
  generateParticipants: (params?: GenerateParticipantsArgs) => any;
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

  importGovernors([mocksGovernor]);

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
