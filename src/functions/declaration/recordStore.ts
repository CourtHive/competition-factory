// constants and types
import { ErrorType, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

type DeclarationRecords<R> = { [id: string]: R };

// Generic in-memory keyed-record store with an "active record" pointer and a
// method registry, shared by declaration-style engines (officiating, sanctioning,
// and a future player/declarations engine). Each engine instantiates its OWN store
// — state is never shared between engines. The id field name and the not-found
// error are injected so emitted results match each domain's behavior byte-for-byte.
// `K` is the injected id field, so a record's id is typed by the key the domain names.
export function createRecordStore<K extends string, R extends { [P in K]: string }>({
  idKey,
  notFoundError,
}: {
  idKey: K;
  notFoundError: ErrorType;
}) {
  const state: { records: DeclarationRecords<R>; activeId?: string; methods: { [key: string]: unknown } } = {
    records: {},
    activeId: undefined,
    methods: {},
  };

  return {
    getRecords: () => state.records,

    getRecord: (id?: string) => {
      const key = id ?? state.activeId;
      return key ? state.records[key] : undefined;
    },

    setRecord: (record: R) => {
      if (!record?.[idKey]) return { error: INVALID_VALUES, context: { message: `Missing ${idKey}` } };
      state.records[record[idKey]] = record;
      return { ...SUCCESS };
    },

    setRecords: (records?: DeclarationRecords<R>) => {
      state.records = records ?? {};
      const ids = Object.keys(state.records);
      state.activeId = ids.length === 1 ? ids[0] : undefined;
      return { ...SUCCESS };
    },

    removeRecord: (id: string) => {
      if (!state.records[id]) return { error: notFoundError, context: { [idKey]: id } };
      delete state.records[id];
      if (state.activeId === id) state.activeId = undefined;
      return { ...SUCCESS };
    },

    getActiveId: () => state.activeId,

    setActiveId: (id?: string) => {
      if (id && !state.records[id]) return { error: notFoundError, context: { [idKey]: id } };
      state.activeId = id;
      return { ...SUCCESS };
    },

    getMethods: () => state.methods,

    setMethods: (toRegister: { [key: string]: unknown }) => {
      Object.keys(toRegister).forEach((key) => {
        if (typeof toRegister[key] === 'function') state.methods[key] = toRegister[key];
      });
      return { ...SUCCESS };
    },

    reset: () => {
      state.records = {};
      state.activeId = undefined;
      state.methods = {};
      return { ...SUCCESS };
    },
  };
}
