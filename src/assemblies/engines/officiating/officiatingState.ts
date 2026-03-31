// Constants
import { OFFICIAL_RECORD_NOT_FOUND } from '@Constants/officiatingConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { OfficialRecord, OfficialRecords } from '@Types/officiatingTypes';

const state: {
  officialRecords: OfficialRecords;
  activeOfficialRecordId?: string;
  methods: { [key: string]: any };
} = {
  officialRecords: {},
  activeOfficialRecordId: undefined,
  methods: {},
};

export function getOfficialRecords(): OfficialRecords {
  return state.officialRecords;
}

export function getOfficialRecord(officialRecordId?: string): OfficialRecord | undefined {
  const id = officialRecordId ?? state.activeOfficialRecordId;
  return id ? state.officialRecords[id] : undefined;
}

export function setOfficialRecord(record: OfficialRecord) {
  if (!record?.officialRecordId) return { error: INVALID_VALUES, context: { message: 'Missing officialRecordId' } };
  state.officialRecords[record.officialRecordId] = record;
  return { ...SUCCESS };
}

export function setOfficialRecords(records: OfficialRecords) {
  state.officialRecords = records ?? {};
  const ids = Object.keys(state.officialRecords);
  state.activeOfficialRecordId = ids.length === 1 ? ids[0] : undefined;
  return { ...SUCCESS };
}

export function removeOfficialRecord(officialRecordId: string) {
  if (!state.officialRecords[officialRecordId]) {
    return { error: OFFICIAL_RECORD_NOT_FOUND, context: { officialRecordId } };
  }
  delete state.officialRecords[officialRecordId];
  if (state.activeOfficialRecordId === officialRecordId) {
    state.activeOfficialRecordId = undefined;
  }
  return { ...SUCCESS };
}

export function getActiveOfficialRecordId(): string | undefined {
  return state.activeOfficialRecordId;
}

export function setActiveOfficialRecordId(officialRecordId?: string) {
  if (officialRecordId && !state.officialRecords[officialRecordId]) {
    return { error: OFFICIAL_RECORD_NOT_FOUND, context: { officialRecordId } };
  }
  state.activeOfficialRecordId = officialRecordId;
  return { ...SUCCESS };
}

export function getOfficiatingMethods() {
  return state.methods;
}

export function setOfficiatingMethods(methods: { [key: string]: any }) {
  Object.keys(methods).forEach((key) => {
    if (typeof methods[key] === 'function') {
      state.methods[key] = methods[key];
    }
  });
  return { ...SUCCESS };
}

export function resetOfficiatingState() {
  state.officialRecords = {};
  state.activeOfficialRecordId = undefined;
  state.methods = {};
  return { ...SUCCESS };
}
