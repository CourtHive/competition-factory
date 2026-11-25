import { addNotice, getProvider, setStateProvider } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// Exercise the suite configuration itself. This test uses the same project as an integrator's ordinary spec.
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
    if (process.env.NOTICE_PAYLOAD_WRITE_CHECK === '1') {
      expect(enqueue).toThrow(/read-only notice payload/);
      expect(delivered).not.toBe(item);
    } else {
      enqueue();
      expect(delivered).toBe(item);
      expect(structuredClone(delivered)).toEqual(item);
    }
  } finally {
    setStateProvider(previous);
  }
});
