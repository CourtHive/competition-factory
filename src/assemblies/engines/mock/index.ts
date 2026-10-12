import { deleteNotices, setDevContext, setDeepCopy, getDevContext } from '@Global/state/globalState';
import * as mocksGovernor from '@Assemblies/governors/mocksGovernor';
import { notifySubscribers } from '@Global/state/notifySubscribers';
import { factoryVersion } from '@Functions/global/factoryVersion';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { createSeededRandom } from '@Tools/prng';
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
    // one instant per generation, captured before anything is written; see tools/clock.ts
    const result = withCapturedClock(() => {
      const generated = method({ ...params });
      if (!generated?.error) notifySubscribers();
      return generated;
    });
    deleteNotices();

    // cleanup if set on invocation
    if (devContextSet) {
      setDevContext(false);
      devContextSet = false;
    }

    return result;
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
      if (typeof params?.nonRandom === 'number') {
        params = { ...params, random: createSeededRandom(params.nonRandom) };
      }
      if (getDevContext()) {
        const invocationResult = engineInvoke(governor[method], params);
        if (!invocationResult?.error && params?.setState && invocationResult?.tournamentRecord) {
          setState(invocationResult.tournamentRecord);
        }
        return invocationResult;
      } else {
        try {
          const invocationResult = engineInvoke(governor[method], params);
          if (!invocationResult?.error && params?.setState && invocationResult?.tournamentRecord) {
            setState(invocationResult.tournamentRecord);
          }
          return invocationResult;
        } catch (err) {
          let error;
          if (typeof err === 'string') {
            error = err.toUpperCase();
          } else if (err instanceof Error) {
            error = err.message;
          }
          pushGlobalLog({
            method: 'mocksEngine',
            params: JSON.stringify(params),
            invoked: method,
            error,
          });
        }
      }
    };
  }
})();

export default mocksEngine;
