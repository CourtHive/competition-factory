import { DevContextType, getDevContext, globalLog } from './globalState';

// types
import { ResultType } from '@Types/factoryTypes';

type EngineLoggingArgs = {
  params?: { [key: string]: any } | boolean;
  result: ResultType;
  engineType: string;
  methodName: string;
  elapsed: number;
  /** True when the call came from `dryRun`/`explain` — the method ran against a
   *  snapshot and nothing was committed. Without the tag a pre-flight and the
   *  real mutation that follows it are indistinguishable in the dev log, which
   *  reads as the mutation having fired twice. */
  dryRun?: boolean;
};

export function engineLogging({ engineType, methodName, elapsed, params, result, dryRun }: EngineLoggingArgs) {
  const devContext: DevContextType = getDevContext();
  if (typeof devContext !== 'object') return;

  const log: any = { method: methodName };
  if (dryRun) log.dryRun = true;
  const logError =
    result?.error &&
    (devContext.errors === true || (Array.isArray(devContext.errors) && devContext.errors.includes(methodName)));

  const specifiedMethodParams = Array.isArray(devContext.params) && devContext.params?.includes(methodName);

  const logParams = (devContext.params && !Array.isArray(devContext.params)) || specifiedMethodParams;

  const exclude = Array.isArray(devContext.exclude) && devContext.exclude.includes(methodName);

  if (
    !exclude &&
    ![undefined, false].includes(devContext.perf) &&
    !isNaN(devContext.perf) &&
    elapsed >= devContext.perf
  ) {
    log.elapsed = elapsed;
  }

  if (!exclude && (logError || logParams)) {
    log.params = params;
  }

  if (
    !exclude &&
    (logError ||
      (devContext.result &&
        !Array.isArray(devContext.result) &&
        (!Array.isArray(devContext.params) || specifiedMethodParams)) ||
      (Array.isArray(devContext.result) && devContext.result?.includes(methodName)))
  ) {
    log.result = result;
  }

  // `method` and `dryRun` are labels, not content — neither on its own is a
  // reason to emit a line. Only elapsed/params/result make a log worth printing.
  const hasContent = Object.keys(log).some((key) => key !== 'method' && key !== 'dryRun');
  if (hasContent) globalLog(log, engineType);
}
