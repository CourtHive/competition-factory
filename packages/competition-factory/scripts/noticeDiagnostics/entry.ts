// The audit build's entry (build.mjs): the package as published, with the read-only notice payload check on from the
// moment it loads.
import { noticePayloadTestMode } from '../../src/global/state/noticePayloadAudit';

noticePayloadTestMode.enabled = true;

export * from '../../src/index';
