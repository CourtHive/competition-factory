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

type DevContextObject = Exclude<DevContextType, boolean>;

/**
 * THE RULES FOR WHAT THE DEV LOG PRINTS, stated once. `engineLogging` applies them after a call;
 * `paramsMayBeLogged` asks them before it, to decide whether params must be copied (#5356). Two copies
 * of the same rule drift: a logging option added to one and not the other either drops params from
 * the log or brings back the copy on every call.
 */
const excludes = (devContext: DevContextObject, methodName: string): boolean =>
  Array.isArray(devContext.exclude) && devContext.exclude.includes(methodName);

/** params are printed for every method (`params: true`) or for the methods listed */
const printsParams = (devContext: DevContextObject, methodName: string): boolean =>
  Array.isArray(devContext.params) ? devContext.params.includes(methodName) : !!devContext.params;

/** an error is printed, with its params and result, for every method (`errors: true`) or for the methods listed */
const printsErrors = (devContext: DevContextObject, methodName: string): boolean =>
  devContext.errors === true || (Array.isArray(devContext.errors) && devContext.errors.includes(methodName));

export function engineLogging({ engineType, methodName, elapsed, params, result, dryRun }: EngineLoggingArgs) {
  const devContext: DevContextType = getDevContext();
  if (typeof devContext !== 'object') return;

  const log: any = { method: methodName };
  if (dryRun) log.dryRun = true;
  const logError = !!result?.error && printsErrors(devContext, methodName);

  const specifiedMethodParams = Array.isArray(devContext.params) && devContext.params.includes(methodName);

  const logParams = printsParams(devContext, methodName);

  const exclude = excludes(devContext, methodName);

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

/**
 * Whether `engineLogging` could print this method's params — for params on request, or for an
 * error it is set to report. The caller copies params before the method runs only when this is
 * true; the error case cannot wait for the result, because by then the method may have changed them.
 */
export function paramsMayBeLogged(methodName: string): boolean {
  const devContext: DevContextType = getDevContext();
  if (typeof devContext !== 'object') return false;
  if (excludes(devContext, methodName)) return false;
  return printsParams(devContext, methodName) || printsErrors(devContext, methodName);
}
