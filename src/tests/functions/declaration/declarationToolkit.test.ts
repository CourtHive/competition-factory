import { executeDeclarationQueue } from '@Functions/declaration/executeDeclarationQueue';
import { transitionRecordStatus } from '@Functions/declaration/transitionRecordStatus';
import { registerCreatedRecord } from '@Functions/declaration/registerCreatedRecord';
import { createRecordStore } from '@Functions/declaration/recordStore';
import { describe, expect, it } from 'vitest';

// constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

// A synthetic "widget" domain — a third expression of the declaration engine, distinct
// from officiating/sanctioning — used to prove the injected configuration contract directly.
const WIDGET_NOT_FOUND = { code: 'ERR_WIDGET_NOT_FOUND', message: 'Widget not found' };
const WIDGET_EXISTS = { code: 'ERR_WIDGET_EXISTS', message: 'Widget exists' };
const WIDGET_MISSING = { code: 'ERR_WIDGET_MISSING', message: 'Missing widget' };
const GADGET_NOT_FOUND = { code: 'ERR_GADGET_NOT_FOUND', message: 'Gadget not found' };
const BAD_TRANSITION = { code: 'ERR_BAD_TRANSITION', message: 'Invalid transition' };
const GADGET_MACHINE: Record<string, string[]> = {
  DRAFT: ['ACTIVE', 'VOID'],
  ACTIVE: ['DONE', 'VOID'],
  DONE: [],
  VOID: [],
};

const newStore = () => createRecordStore({ idKey: 'widgetId', notFoundError: WIDGET_NOT_FOUND });

describe('declaration toolkit — createRecordStore (injected idKey + not-found error)', () => {
  it('starts empty and stores/reads by id and active pointer', () => {
    const store = newStore();
    expect(store.getRecords()).toEqual({});
    expect(store.getActiveId()).toBeUndefined();

    expect(store.setRecord({ widgetId: 'w1', n: 1 } as any).success).toEqual(true);
    expect(store.getRecord('w1')).toEqual({ widgetId: 'w1', n: 1 });
  });

  it('rejects a record missing the injected idKey with a domain-shaped message', () => {
    const result: any = newStore().setRecord({ n: 1 } as any);
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.message).toEqual('Missing widgetId');
  });

  it('auto-activates a single record via setRecords and clears it for multiple', () => {
    const single = newStore();
    single.setRecords({ w1: { widgetId: 'w1' } } as any);
    expect(single.getActiveId()).toEqual('w1');
    expect(single.getRecord()).toEqual({ widgetId: 'w1' }); // no id → active

    const multi = newStore();
    multi.setRecords({ w1: { widgetId: 'w1' }, w2: { widgetId: 'w2' } } as any);
    expect(multi.getActiveId()).toBeUndefined();
  });

  it('removeRecord / setActiveId surface the injected not-found error with id context', () => {
    const store = newStore();
    expect(store.removeRecord('nope')).toEqual({ error: WIDGET_NOT_FOUND, context: { widgetId: 'nope' } });
    expect(store.setActiveId('nope')).toEqual({ error: WIDGET_NOT_FOUND, context: { widgetId: 'nope' } });

    store.setRecord({ widgetId: 'w1' } as any);
    store.setActiveId('w1');
    expect(store.removeRecord('w1').success).toEqual(true);
    expect(store.getActiveId()).toBeUndefined(); // active cleared when the active record is removed
  });

  it('method registry stores functions, ignores non-functions, and reset clears everything', () => {
    const store = newStore();
    const fn = () => 'x';
    store.setMethods({ fn, notAFn: 'string' } as any);
    expect(store.getMethods().fn).toBe(fn);
    expect(store.getMethods().notAFn).toBeUndefined();

    store.setRecord({ widgetId: 'w1' } as any);
    store.reset();
    expect(store.getRecords()).toEqual({});
    expect(store.getActiveId()).toBeUndefined();
    expect(store.getMethods()).toEqual({});
  });

  it('two stores never share state', () => {
    const a = newStore();
    const b = newStore();
    a.setRecord({ widgetId: 'w1' } as any);
    expect(a.getRecords()).toHaveProperty('w1');
    expect(b.getRecords()).toEqual({});
  });
});

describe('declaration toolkit — registerCreatedRecord (injected recordKey/idKey/exists error)', () => {
  const register = (store: any, result: any) =>
    registerCreatedRecord({
      result,
      recordKey: 'widget',
      idKey: 'widgetId',
      getRecord: store.getRecord,
      setRecord: store.setRecord,
      setActiveId: store.setActiveId,
      existsError: WIDGET_EXISTS,
    });

  it('passes through a builder error and a result missing the record', () => {
    const store = newStore();
    expect(register(store, { error: WIDGET_MISSING })).toEqual({ error: WIDGET_MISSING });
    expect(register(store, { success: true })).toEqual({ success: true }); // no `widget` key
  });

  it('persists + activates a created record, then rejects a duplicate id', () => {
    const store = newStore();
    const created = { success: true, widget: { widgetId: 'w1' } };
    expect(register(store, created)).toEqual(created);
    expect(store.getRecord('w1')).toEqual({ widgetId: 'w1' });
    expect(store.getActiveId()).toEqual('w1');

    expect(register(store, { success: true, widget: { widgetId: 'w1' } })).toEqual({ error: WIDGET_EXISTS });
  });
});

describe('declaration toolkit — transitionRecordStatus (injected machine + errors + hooks)', () => {
  const baseArgs = () => ({
    collectionKey: 'gadgets',
    idKey: 'gadgetId',
    machineDef: GADGET_MACHINE,
    resultKey: 'gadget',
    errors: { missingRecord: WIDGET_MISSING, notFound: GADGET_NOT_FOUND, invalidTransition: BAD_TRANSITION },
  });
  const record = () => ({ widgetId: 'w1', gadgets: [{ gadgetId: 'g1', status: 'DRAFT' }] });

  it('guards missing record / entityId / toStatus', () => {
    expect(transitionRecordStatus({ ...baseArgs(), record: undefined, entityId: 'g1', toStatus: 'ACTIVE' })).toEqual({
      error: WIDGET_MISSING,
    });
    const missingId: any = transitionRecordStatus({ ...baseArgs(), record: record(), toStatus: 'ACTIVE' });
    expect(missingId.context.message).toEqual('Missing gadgetId');
    const missingTo: any = transitionRecordStatus({ ...baseArgs(), record: record(), entityId: 'g1' });
    expect(missingTo.context.message).toEqual('Missing toStatus');
  });

  it('surfaces injected not-found and invalid-transition errors with context', () => {
    expect(transitionRecordStatus({ ...baseArgs(), record: record(), entityId: 'gX', toStatus: 'ACTIVE' })).toEqual({
      error: GADGET_NOT_FOUND,
      context: { gadgetId: 'gX' },
    });
    expect(transitionRecordStatus({ ...baseArgs(), record: record(), entityId: 'g1', toStatus: 'DONE' })).toEqual({
      error: BAD_TRANSITION,
      context: { fromStatus: 'DRAFT', toStatus: 'DONE', validTargets: ['ACTIVE', 'VOID'] },
    });
  });

  it('performs a valid transition, appends statusHistory, and touches updatedAt', () => {
    const rec: any = record();
    const result: any = transitionRecordStatus({
      ...baseArgs(),
      record: rec,
      entityId: 'g1',
      toStatus: 'ACTIVE',
      transitionedBy: 'tester',
      reason: 'go',
    });
    expect(result.success).toEqual(true);
    expect(result.gadget.status).toEqual('ACTIVE');
    expect(rec.gadgets[0].statusHistory).toHaveLength(1);
    expect(rec.gadgets[0].statusHistory[0]).toMatchObject({ fromStatus: 'DRAFT', toStatus: 'ACTIVE', reason: 'go' });
    expect(typeof rec.updatedAt).toEqual('string');
  });

  it('honors an injected preTransition guard (block) and pass-through (undefined)', () => {
    const block = transitionRecordStatus({
      ...baseArgs(),
      record: record(),
      entityId: 'g1',
      toStatus: 'ACTIVE',
      preTransition: () => ({ error: BAD_TRANSITION, context: { guarded: true } }),
    });
    expect(block).toEqual({ error: BAD_TRANSITION, context: { guarded: true } });

    const pass: any = transitionRecordStatus({
      ...baseArgs(),
      record: record(),
      entityId: 'g1',
      toStatus: 'ACTIVE',
      preTransition: () => undefined,
    });
    expect(pass.success).toEqual(true);
  });

  it('uses an injected touch hook instead of updatedAt when provided', () => {
    const rec: any = record();
    transitionRecordStatus({
      ...baseArgs(),
      record: rec,
      entityId: 'g1',
      toStatus: 'ACTIVE',
      touch: (r: any, ts: string) => {
        r.customTouchedAt = ts;
      },
    });
    expect(typeof rec.customTouchedAt).toEqual('string');
    expect(rec.updatedAt).toBeUndefined();
  });
});

describe('declaration toolkit — executeDeclarationQueue (pipe + rollback over injected store)', () => {
  const makeEngine = (store: any) => ({
    add: (params: any) => {
      store.setRecord({ widgetId: params.id });
      return { success: true, widgetId: params.id };
    },
    produce: (params: any) => ({ success: true, producedId: `${params.seed}-x` }),
    consume: (params: any) => ({ success: true, consumed: params.producedId }),
    boom: () => ({ error: WIDGET_MISSING }),
  });

  it('rejects non-array directives and non-object directives', () => {
    const store = newStore();
    const engine = makeEngine(store);
    const args = { engine, getRecords: store.getRecords, setRecords: store.setRecords };
    expect(executeDeclarationQueue({ ...args, directives: 'nope' as any })).toEqual({
      error: INVALID_VALUES,
      context: { message: 'directives must be an array' },
    });
    expect(executeDeclarationQueue({ ...args, directives: ['nope' as any] })).toEqual({
      error: INVALID_VALUES,
      context: { message: 'directive must be an object' },
    });
  });

  it('reports an unknown method and pipes output between directives', () => {
    const store = newStore();
    const engine = makeEngine(store);
    const args = { engine, getRecords: store.getRecords, setRecords: store.setRecords };

    const unknown: any = executeDeclarationQueue({ ...args, directives: [{ method: 'ghost' }] });
    expect(unknown.error).toEqual(INVALID_VALUES);
    expect(unknown.context.message).toEqual('Method not found: ghost');

    const piped: any = executeDeclarationQueue({
      ...args,
      directives: [
        { method: 'produce', params: { seed: 'w' } },
        { method: 'consume', pipe: { producedId: true } },
      ],
    });
    expect(piped.success).toEqual(true);
    expect(piped.results[1].consumed).toEqual('w-x');
  });

  it('rolls back to the snapshot when a directive errors with rollbackOnError', () => {
    const store = newStore();
    const engine = makeEngine(store);
    const result: any = executeDeclarationQueue({
      engine,
      getRecords: store.getRecords,
      setRecords: store.setRecords,
      rollbackOnError: true,
      directives: [{ method: 'add', params: { id: 'w1' } }, { method: 'boom' }],
    });
    expect(result.error).toEqual(WIDGET_MISSING);
    expect(result.rolledBack).toEqual(true);
    expect(store.getRecords()).toEqual({}); // the 'add' was undone
  });
});
