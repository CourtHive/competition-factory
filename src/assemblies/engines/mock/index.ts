import { handleCaughtError, deleteNotices, setDevContext, setDeepCopy, getDevContext } from '@Global/state/globalState';
import { seedRandomParam } from '@Assemblies/engines/parts/seedRandomParam';
import * as mocksGovernor from '@Assemblies/governors/mocksGovernor';
import { notifySubscribers } from '@Global/state/notifySubscribers';
import { factoryVersion } from '@Functions/global/factoryVersion';
import { withCapturedClock } from '@Tools/clock';

import { setState } from '@Assemblies/engines/parts/stateMethods';
import { FactoryEngine } from '@Types/factoryTypes';

let devContextSet = false;

export const mocksEngine = (() => {
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

  return engine;

  // enable Middleware
  function engineInvoke(method, params) {
    try {
      // one instant per generation, captured before anything is written; see tools/clock.ts
      return withCapturedClock(() => {
        const generated = method({ ...params });
        if (!generated?.error) notifySubscribers();
        return generated;
      });
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
      if (typeof params?.nonRandom === 'number') params = seedRandomParam({ ...params });
      // read before invoking: the invocation resets an invocation-scoped devContext
      const rethrow = getDevContext();
      try {
        const invocationResult = engineInvoke(governor[method], params);
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
