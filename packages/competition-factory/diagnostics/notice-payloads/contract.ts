// Compiled only against the overlay. Removing or changing its public option must fail the diagnostic build.
import { globalState } from '../../src';

export function enableNoticeAudit() {
  return globalState.setOutcomePipeline('differential', { checkNoticePayloadWrites: true });
}
