type RegisterCreatedRecordArgs = {
  result: any;
  recordKey: string;
  idKey: string;
  getRecord: (id?: string) => any;
  setRecord: (record: any) => any;
  setActiveId: (id?: string) => any;
  existsError: any;
};

// Generic "register a freshly-created record" step shared by declaration engines:
// validate the domain builder's result, reject a duplicate id, persist it, and make
// it the active record. The domain supplies its own record builder (via `result`)
// and its own duplicate-id error (`existsError`); everything else is population-agnostic.
export function registerCreatedRecord({
  result,
  recordKey,
  idKey,
  getRecord,
  setRecord,
  setActiveId,
  existsError,
}: RegisterCreatedRecordArgs) {
  if (result.error) return result;
  const record = result[recordKey];
  if (!record) return result;

  if (getRecord(record[idKey])) return { error: existsError };

  setRecord(record);
  setActiveId(record[idKey]);
  return result;
}
