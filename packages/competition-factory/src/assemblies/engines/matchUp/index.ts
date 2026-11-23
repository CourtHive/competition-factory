import { setDeepCopy, setDevContext, getDevContext, deleteNotices, handleCaughtError } from '@Global/state/globalState';
import { getMatchUps, getMatchUp, setState, getState, reset } from './stateMethods';
import * as scoreGovernor from '@Assemblies/governors/scoreGovernor';
import { notifySubscribers } from '@Global/state/notifySubscribers';
import { factoryVersion } from '@Functions/global/factoryVersion';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { SUCCESS } from '@Constants/resultConstants';
import { FactoryEngine } from '@Types/factoryTypes';

export const matchUpEngine = (() => {
  const engine: FactoryEngine = {
    getState: (params) => getState(params),
    version: () => factoryVersion(),
    reset: () => {
      reset();
      return { ...SUCCESS };
    },
    drawId: undefined,
    error: undefined,
    success: false,
    devContext: (contextCriteria) => {
      setDevContext(contextCriteria);
      return engine;
    },
    setState: (definition, deepCopyOption, deepCopyAttributes) => {
      setDeepCopy(deepCopyOption, deepCopyAttributes);
      const result = setState(definition);
      return processResult(result);
    },
  };

  function processResult(result) {
    if (result?.error) {
      engine.error = result.error;
      engine.success = false;
    } else {
      engine.error = undefined;
      engine.success = true;
      engine.drawId = result.drawId;
    }
    return engine;
  }

  importGovernors(engine, [scoreGovernor]);

  return engine;
})();

function importGovernors(engine, governors) {
  governors.forEach((governor) => {
    Object.keys(governor).forEach((methodName) => {
      engine[methodName] = (params) => {
        if (getDevContext()) {
          return invoke(engine, { params, governor, methodName });
        } else {
          try {
            return invoke(engine, { params, governor, methodName });
          } catch (err) {
            handleCaughtError({
              engineName: 'matchUpEngine',
              methodName,
              params,
              err,
            });
          }
        }
      };
    });
  });
}

function invoke(engine, { params, governor, methodName }) {
  engine.error = undefined;
  engine.success = false;

  const matchUp = params?.matchUp || getMatchUp();
  const matchUps = params?.matchUps || getMatchUps();

  const snapshot = params?.rollbackOnError && makeDeepCopy(matchUp, false, true);

  params = {
    ...params,
    matchUpId: matchUp?.matchUpId,
    matchUps,
    matchUp,
  };

  const result = governor[methodName](params);

  if (result?.error) {
    if (snapshot) setState(snapshot);
    return { ...result, rolledBack: !!snapshot };
  }

  const notify = result?.success && params?.delayNotify !== true && params?.doNotNotify !== true;
  if (notify) notifySubscribers();
  if (notify || !result?.success || params?.doNotNotify) deleteNotices();

  return result;
}

export default matchUpEngine;
