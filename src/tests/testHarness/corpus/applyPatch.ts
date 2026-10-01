/**
 * RFC 6902 patch application, the READER half of the corpus contract: apply each step's patch to
 * the previous state and recompute the hash. `forge/jsonPatch.ts` only generates; a consumer in
 * another language applies, so this is written against the RFC, not against the generator.
 */
export type PatchOp =
  | { op: 'add'; path: string; value: unknown }
  | { op: 'remove'; path: string }
  | { op: 'replace'; path: string; value: unknown }
  | { op: 'move'; path: string; from: string }
  | { op: 'copy'; path: string; from: string }
  | { op: 'test'; path: string; value: unknown };

export class PatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PatchError';
  }
}

function segments(pointer: string): string[] {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) throw new PatchError(`not a JSON pointer: ${pointer}`);
  return pointer
    .slice(1)
    .split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function clone<T>(value: T): T {
  // patch values are JSON by construction, so structuredClone loses nothing here
  return value === undefined ? value : structuredClone(value);
}

function parent(doc: any, path: string): { container: any; key: string } {
  const segs = segments(path);
  if (!segs.length) throw new PatchError('operation on the root needs the whole-document form');
  let node = doc;
  for (const seg of segs.slice(0, -1)) {
    if (node === null || typeof node !== 'object') throw new PatchError(`path does not exist: ${path}`);
    node = Array.isArray(node) ? node[Number(seg)] : node[seg];
  }
  if (node === null || typeof node !== 'object') throw new PatchError(`path does not exist: ${path}`);
  return { container: node, key: segs[segs.length - 1] };
}

function get(doc: any, path: string): unknown {
  if (path === '') return doc;
  const { container, key } = parent(doc, path);
  if (Array.isArray(container)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= container.length)
      throw new PatchError(`no index ${key} at ${path}`);
    return container[index];
  }
  if (!(key in container)) throw new PatchError(`no member ${key} at ${path}`);
  return container[key];
}

function add(doc: any, path: string, value: unknown): any {
  if (path === '') return clone(value);
  const { container, key } = parent(doc, path);
  if (Array.isArray(container)) {
    if (key === '-') container.push(clone(value));
    else {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || index > container.length)
        throw new PatchError(`bad index ${key} at ${path}`);
      container.splice(index, 0, clone(value));
    }
  } else container[key] = clone(value);
  return doc;
}

function remove(doc: any, path: string): any {
  if (path === '') throw new PatchError('cannot remove the root');
  const { container, key } = parent(doc, path);
  if (Array.isArray(container)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= container.length)
      throw new PatchError(`no index ${key} at ${path}`);
    container.splice(index, 1);
  } else {
    if (!(key in container)) throw new PatchError(`no member ${key} at ${path}`);
    delete container[key];
  }
  return doc;
}

/** Apply `patch` to a deep copy of `document` and return the result. The input is not mutated. */
export function applyPatch<T = unknown>(document: T, patch: PatchOp[]): T {
  let doc: any = clone(document);
  for (const op of patch) {
    switch (op.op) {
      case 'add':
        doc = add(doc, op.path, op.value);
        break;
      case 'remove':
        doc = remove(doc, op.path);
        break;
      case 'replace':
        get(doc, op.path); // must exist
        doc = add(path(op.path) ? remove(doc, op.path) : doc, op.path, op.value);
        break;
      case 'move': {
        const value = clone(get(doc, op.from));
        doc = remove(doc, op.from);
        doc = add(doc, op.path, value);
        break;
      }
      case 'copy':
        doc = add(doc, op.path, clone(get(doc, op.from)));
        break;
      case 'test':
        if (JSON.stringify(get(doc, op.path)) !== JSON.stringify(op.value))
          throw new PatchError(`test failed at ${op.path}`);
        break;
      default:
        throw new PatchError(`unknown op ${(op as any).op}`);
    }
  }
  return doc as T;
}

function path(p: string): boolean {
  return p !== '';
}
