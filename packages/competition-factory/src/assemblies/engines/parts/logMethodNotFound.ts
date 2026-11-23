import { engineLogging } from '@Global/state/engineLogging';

// constants and types
import { METHOD_NOT_FOUND } from '@Constants/errorConditionConstants';
import { ResultType } from '@Types/factoryTypes';

type LogMethodNotFoundArgs = {
  params?: { [key: string]: any };
  methodName: string;
  start?: number;
};

export function logMethodNotFound({ methodName, params, start }: LogMethodNotFoundArgs): ResultType {
  const result = { error: METHOD_NOT_FOUND, methodName };
  const elapsed = start ? Date.now() - start : 0;
  engineLogging({
    result,
    methodName,
    elapsed,
    params,
    engineType: 'sync',
  });
  return result;
}
