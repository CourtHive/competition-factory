import { methodRemoved, REMOVED_METHOD_MIGRATIONS } from '@Global/state/methodRemoved';
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
  const migration = REMOVED_METHOD_MIGRATIONS.get(methodName);
  const result = migration
    ? { ...methodRemoved(methodName, undefined, migration), methodName }
    : { error: METHOD_NOT_FOUND, methodName };
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
