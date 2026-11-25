import { addNotice, getProvider, setStateProvider } from '@Global/state/globalState';
import { takeNoticePayloadViolations } from '@Global/state/noticePayloadAudit';
import { expect, it } from 'vitest';

// Exercise the suite configuration itself, in an ordinary spec: NOTICE_PAYLOAD_WRITE_CHECK=1 compiles the detector in
// and turns it on (vitest.config.mts); otherwise the payload is delivered as it is, as in a published bundle.
it('selects raw or write-checked delivery through the suite audit switch', () => {
  const previous = getProvider();
  const item = { value: 1 };
  let delivered: typeof item | undefined;
  try {
    setStateProvider({
      ...previous,
      addNotice({ payload }: { payload: typeof item }) {
        delivered = payload;
        payload.value = 1;
      },
    });
    const enqueue = () => addNotice({ topic: 'score', payload: item });
    if (__NOTICE_PAYLOAD_DIAGNOSTICS__) {
      expect(enqueue).toThrow(/read-only notice payload/);
      expect(delivered).not.toBe(item);
      expect(takeNoticePayloadViolations()).toHaveLength(1);
    } else {
      enqueue();
      expect(delivered).toBe(item);
      expect(structuredClone(delivered)).toEqual(item);
    }
  } finally {
    setStateProvider(previous);
  }
});
