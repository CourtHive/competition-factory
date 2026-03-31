import { deleteNotices, setDevContext, setDeepCopy, getDevContext } from '@Global/state/globalState';
import { notifySubscribers } from '@Global/state/notifySubscribers';
import * as mocksGovernor from '@Assemblies/governors/mocksGovernor';
import { factoryVersion } from '@Functions/global/factoryVersion';
import { createSeededRandom } from '@Tools/prng';

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
    const result = method({ ...params });
    if (!result?.error) notifySubscribers();
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
          console.log('ERROR', {
            params: JSON.stringify(params),
            method,
            error,
          });
        }
      }
    };
  }
})();

export default mocksEngine;
