import { getCapturedStamps } from '@Global/state/globalState';

type Node = Record<string | number, unknown>;
type Origin = { parent?: object; key?: string | number };

const isNode = (value: unknown): value is Node =>
  typeof value === 'object' && value !== null && !(value instanceof Date);

/**
 * RECORDED (CA, 2026-11-16): the object graph a recorded cascade left on v2's working copy, so apply can leave the
 * SAME graph on the stored draw, not only the same values. v1 writes through the stored objects: an object it kept is
 * the object that was there, one object it wrote in two places is one object in both, and a key it set late comes
 * late. A value-only replacement loses all three, and the exact-graph qualification compares them.
 *
 * `origins` is where every object of the copy stood before the module ran (its parent and key). Bound to a target
 * draw, each is resolved there once, before anything is written: that is its COUNTERPART. `mirror` then makes a stored
 * entity what its copy is: a counterpart is kept and given the copy's keys in the copy's order; an object the module
 * created, or took from the call (its score), is taken as it is, as v1 stores it.
 *
 * Only apply binds (`bindResultInputs`). The working view and the shadow fold the recorded values as fresh clones.
 */
export class Recording {
  private readonly origins = new Map<object, Origin>();
  private readonly sources = new Map<string, object>();
  private readonly bindings = new Map<object, { counterpart: Map<object, object>; done: Map<object, object> }>();

  /** `root`: the working copy's draw as the module is about to find it */
  constructor(private readonly root: object) {
    const visit = (value: unknown, origin: Origin) => {
      if (!isNode(value) || this.origins.has(value)) return;
      this.origins.set(value, origin);
      for (const key of Object.keys(value)) visit(value[key], { parent: value, key });
    };
    visit(root, {});
  }

  /** The detached draw contains this object. External aliases can make a bounded write nonlocal. */
  contains(value: object): boolean {
    return this.origins.has(value);
  }

  /** ops are data: a recording says nothing when they are serialized */
  toJSON() {
    return undefined;
  }

  /** the copy's entity an op replaces, by the op's own name for it */
  source(name: string, entity: object) {
    this.sources.set(name, entity);
  }

  private bind(targetRoot: object) {
    const existing = this.bindings.get(targetRoot);
    if (existing) return existing;
    const counterpart = new Map<object, object>();
    const resolve = (value: object): object | undefined => {
      if (value === this.root) return targetRoot;
      if (counterpart.has(value)) return counterpart.get(value);
      const { parent, key } = this.origins.get(value) ?? {};
      const held = parent && key !== undefined ? (resolve(parent) as Node | undefined)?.[key] : undefined;
      if (!isNode(held)) return undefined;
      counterpart.set(value, held);
      return held;
    };
    counterpart.set(this.root, targetRoot);
    for (const value of this.origins.keys()) resolve(value);
    const binding = { counterpart, done: new Map<object, object>() };
    this.bindings.set(targetRoot, binding);
    return binding;
  }

  /** make `target`, an entity of the draw at `targetRoot`, the graph its copy is; `kept` children are left to their own ops */
  mirror(targetRoot: object, name: string, target: object | undefined, kept: string[]): { error?: string } {
    const source = this.sources.get(name);
    if (!target || !source) return { error: `recorded: no ${name}` };
    const { counterpart, done } = this.bind(targetRoot);

    const sync = (into: Node, from: Node, keep: string[]) => {
      const entries = Object.keys(from).map((key): [string, unknown] => [
        key,
        keep.includes(key) ? into[key] : translate(from[key]),
      ]);
      if (into === from) {
        for (const [key, value] of entries) from[key] = value;
        return;
      }
      const keys = Object.keys(into);
      const same =
        keys.length === entries.length && entries.every(([key, value], at) => keys[at] === key && into[key] === value);
      if (same) return;
      for (const key of keys) delete into[key];
      for (const [key, value] of entries) into[key] = value;
    };

    const translate = (value: unknown): unknown => {
      if (!isNode(value)) return value;
      const known = done.get(value);
      if (known) return known;
      const into = (counterpart.get(value) ?? value) as Node;
      done.set(value, into);
      if (!Array.isArray(value)) {
        sync(into, value, []);
        return into;
      }
      const items = value.map(translate);
      const list = into as unknown as unknown[];
      if (list.length !== items.length || items.some((item, at) => list[at] !== item)) {
        list.length = 0;
        list.push(...items);
      }
      return into;
    };

    const entity = target as Node;
    const stampedBefore = entity.updatedAt;
    if (!done.has(source)) {
      done.set(source, target);
      sync(entity, source as Node, kept);
    }
    if (entity.updatedAt !== stampedBefore) getCapturedStamps()?.add(target);
    return {};
  }
}
