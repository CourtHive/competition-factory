import type { SanctioningRecord, SanctioningRecords } from '@Types/sanctioningTypes';
import { SANCTIONING_RECORD_NOT_FOUND } from '@Constants/sanctioningConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

const state: {
  sanctioningRecords: SanctioningRecords;
  activeSanctioningId?: string;
  methods: { [key: string]: any };
} = {
  sanctioningRecords: {},
  activeSanctioningId: undefined,
  methods: {},
};

export function getSanctioningRecords(): SanctioningRecords {
  return state.sanctioningRecords;
}

export function getSanctioningRecord(sanctioningId?: string): SanctioningRecord | undefined {
  const id = sanctioningId ?? state.activeSanctioningId;
  return id ? state.sanctioningRecords[id] : undefined;
}

export function setSanctioningRecord(record: SanctioningRecord) {
  if (!record?.sanctioningId) return { error: INVALID_VALUES, context: { message: 'Missing sanctioningId' } };
  state.sanctioningRecords[record.sanctioningId] = record;
  return { ...SUCCESS };
}

export function setSanctioningRecords(records: SanctioningRecords) {
  state.sanctioningRecords = records ?? {};
  const ids = Object.keys(state.sanctioningRecords);
  state.activeSanctioningId = ids.length === 1 ? ids[0] : undefined;
  return { ...SUCCESS };
}

export function removeSanctioningRecord(sanctioningId: string) {
  if (!state.sanctioningRecords[sanctioningId]) {
    return { error: SANCTIONING_RECORD_NOT_FOUND, context: { sanctioningId } };
  }
  delete state.sanctioningRecords[sanctioningId];
  if (state.activeSanctioningId === sanctioningId) {
    state.activeSanctioningId = undefined;
  }
  return { ...SUCCESS };
}

export function getActiveSanctioningId(): string | undefined {
  return state.activeSanctioningId;
}

export function setActiveSanctioningId(sanctioningId?: string) {
  if (sanctioningId && !state.sanctioningRecords[sanctioningId]) {
    return { error: SANCTIONING_RECORD_NOT_FOUND, context: { sanctioningId } };
  }
  state.activeSanctioningId = sanctioningId;
  return { ...SUCCESS };
}

export function getSanctioningMethods() {
  return state.methods;
}

export function setSanctioningMethods(methods: { [key: string]: any }) {
  Object.keys(methods).forEach((key) => {
    if (typeof methods[key] === 'function') {
      state.methods[key] = methods[key];
    }
  });
  return { ...SUCCESS };
}

export function resetSanctioningState() {
  state.sanctioningRecords = {};
  state.activeSanctioningId = undefined;
  state.methods = {};
  return { ...SUCCESS };
}
