import { noticePayloadTestMode, takeNoticePayloadViolations } from '@Global/state/noticePayloadAudit';
import { afterEach } from 'vitest';

/**
 * Vitest setupFiles hook under NOTICE_PAYLOAD_WRITE_CHECK=1 (vitest.config.mts): every test runs with the read-only
 * notice payload detector on (CA ruling 27). A write through a payload throws where it happens. It is also recorded,
 * so a write whose throw was caught, or became a rejection nothing awaited, still fails the test here. A test that
 * makes writes on purpose takes them in its own afterEach, which runs before this one.
 */
noticePayloadTestMode.enabled = true;

afterEach(() => {
  const writes = takeNoticePayloadViolations();
  if (writes.length)
    throw new Error(`${writes.length} write(s) through a read-only notice payload:\n${writes.join('\n\n')}`);
});
