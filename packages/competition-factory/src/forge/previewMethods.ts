import { runPrivatePreview } from './privateRuntime';
import { installPreviewRunner } from './previewRunner';
import {
  setBuiltinPreviewMethods,
  setPreviewMethod,
  type PreviewImplementation,
  type PreviewParams,
} from './previewBindings';

export type { PrivatePreviewEngine, PreviewImplementation, PreviewParams } from './previewBindings';

export function registerBuiltinPreviewMethods<T extends object>(namespace: T): T {
  installPreviewRunner(runPrivatePreview);
  return setBuiltinPreviewMethods(namespace);
}

/** Bind a raw importMethods function to its implementation for the private engine. */
export function registerPreviewMethod<Params extends object = PreviewParams>(
  engine: object,
  liveMethod: (...args: never[]) => unknown,
  privateImplementation: PreviewImplementation<Params>,
): void {
  setPreviewMethod(engine, liveMethod, privateImplementation);
  installPreviewRunner(runPrivatePreview);
}
