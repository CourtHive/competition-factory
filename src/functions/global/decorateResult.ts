import { definedAttributes } from '@Tools/definedAttributes';

// constants
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

type DecorateResultArgs = {
  context?: { [key: string]: any };
  stack?: string | string[];
  error?: any;
  result: any;
  info?: any;
};

export function decorateResult({ context, result, stack, info }: DecorateResultArgs): ResultType {
  if (result && !Array.isArray(result?.stack)) result.stack = [];
  if (result && Array.isArray(result?.stack) && typeof stack === 'string') {
    result.stack.push(stack);
  }
  if (result && info) {
    result.info = info;
  }
  if (result && typeof context === 'object' && Object.keys(context).length) {
    result.context ??= {};
    Object.assign(result.context, definedAttributes(context));
  }

  if (result && !result?.error && !result?.success) {
    Object.assign(result, { ...SUCCESS });
  }

  return result ?? { success: true };
}
