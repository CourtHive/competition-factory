import { finishPreview } from './finishPreview';
import type { runPrivatePreview } from './privateRuntime';

type PreviewRunner = typeof runPrivatePreview;

// Before any method has registered, preflight refuses every nonempty plan.
// An empty queue still runs in its own child and reports pending notices and timing.
export let runPreview: PreviewRunner = (state, _engine, _bindings, _methods, asyncEngine, snapshotStart) =>
  finishPreview(state, { results: [] }, asyncEngine, snapshotStart, Date.now());

export function installPreviewRunner(runner: PreviewRunner) {
  runPreview = runner;
}
