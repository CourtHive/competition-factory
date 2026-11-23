export function processResult(engine, result?) {
  if (result?.error) {
    engine.error = result.error;
    engine.success = false;
  } else {
    engine.error = undefined;
    engine.success = true;
  }
  return engine;
}
