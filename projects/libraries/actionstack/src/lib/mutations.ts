/** Private transaction machinery. Journals are for commits, paths for invalidation. */
export type StatePath = PropertyKey[];
export type Write = { target: any; key: PropertyKey; value?: any; remove?: boolean; op?: CollectionOp };

/** Replayed on the original instance at commit: Map/Set method calls and Date time changes. */
export type CollectionOp =
  | { kind: 'insert'; key?: any; value: any }
  | { kind: 'remove'; key: any }
  | { kind: 'clear' }
  | { kind: 'time'; value: number };

export const DATE_READS: PropertyKey[] = [
  'getTime', 'valueOf', 'toString', 'toDateString', 'toTimeString', 'toISOString', 'toJSON',
  'toUTCString', 'toGMTString', 'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString',
  'getYear', 'getFullYear', 'getUTCFullYear', 'getMonth', 'getUTCMonth', 'getDate', 'getUTCDate',
  'getDay', 'getUTCDay', 'getHours', 'getUTCHours', 'getMinutes', 'getUTCMinutes', 'getSeconds',
  'getUTCSeconds', 'getMilliseconds', 'getUTCMilliseconds', 'getTimezoneOffset', Symbol.toPrimitive,
];

const DATE_WRITES: PropertyKey[] = [
  'setTime', 'setMilliseconds', 'setUTCMilliseconds', 'setSeconds', 'setUTCSeconds', 'setMinutes',
  'setUTCMinutes', 'setHours', 'setUTCHours', 'setDate', 'setUTCDate', 'setMonth', 'setUTCMonth',
  'setFullYear', 'setUTCFullYear', 'setYear',
];

export function applyOp(target: any, op: CollectionOp): void {
  if (target instanceof Date) Date.prototype.setTime.call(target, (op as { value: number }).value);
  else if (target instanceof Map) {
    if (op.kind === 'clear') Map.prototype.clear.call(target);
    else if (op.kind === 'remove') Map.prototype.delete.call(target, op.key);
    else if (op.kind === 'insert') Map.prototype.set.call(target, op.key, op.value);
  } else {
    if (op.kind === 'clear') Set.prototype.clear.call(target);
    else if (op.kind === 'remove') Set.prototype.delete.call(target, op.key);
    else if (op.kind === 'insert') Set.prototype.add.call(target, op.value);
  }
}

/** Collection subclasses may run arbitrary user code; keep those opaque. */
export const isCollection = (value: any): boolean => value !== null && typeof value === 'object' &&
  [Map.prototype, Set.prototype, Date.prototype].includes(Object.getPrototypeOf(value));

export const isContainer = (value: any): boolean => value !== null &&
  typeof value === 'object' && (Array.isArray(value) ||
    Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const keys = (value: any) => Reflect.ownKeys(value).filter(key =>
  !(Array.isArray(value) && key === 'length'));
const copy = (value: any): any => {
  const result = Array.isArray(value) ? new Array(value.length) : Object.create(Object.getPrototypeOf(value));
  for (const key of keys(value)) Object.defineProperty(result, key, {
    value: value[key], writable: true, configurable: true, enumerable: true,
  });
  return result;
};

/** Every mutable edge, including collection keys and members, belongs to the state tree. */
export function validateTree(value: any, seen = new WeakSet<object>(), identity = (item: any) => item): void {
  if (value === null || typeof value !== 'object') return;
  if (seen.has(identity(value))) throw new Error('Actionstack state must be a tree: cyclic/shared mutable references are unsupported.');
  seen.add(identity(value));
  if (isCollection(value)) {
    if (Reflect.ownKeys(value).length)
      throw new Error('Actionstack state collections cannot have custom own properties.');
    if (value instanceof Map) for (const [key, item] of value) {
      validateTree(key, seen, identity);
      validateTree(item, seen, identity);
    }
    else if (value instanceof Set) for (const item of value) validateTree(item, seen, identity);
    return;
  }
  if (!isContainer(value)) return;
  for (const key of keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!('value' in descriptor)) throw new Error('Actionstack state does not support accessors.');
    validateTree(descriptor.value, seen, identity);
  }
}

export const prefix = (a: StatePath, b: StatePath): boolean =>
  a.length <= b.length && a.every((key, index) => key === b[index]);
export const overlaps = (a: StatePath, b: StatePath): boolean => prefix(a, b) || prefix(b, a);

export class MutationBatch {
  private identities = new WeakMap<object, any>();
  private writes: Write[] = [];
  /** Slots where this batch placed a new object: commit resolves exactly these, not the whole tree. */
  private placements = new Map<object, Set<PropertyKey>>();
  readonly changes: StatePath[] = [];
  constructor(public state: any) {}

  private place(parent: object, key: PropertyKey): void {
    let keys = this.placements.get(parent);
    if (!keys) { keys = new Set(); this.placements.set(parent, keys); }
    keys.add(key);
  }

  private live = (value: any): any => value && typeof value === 'object'
    ? this.identities.get(value) ?? value : value;

  async run(path: StatePath, recipe: (draft: any) => any): Promise<void> {
    let base = this.state;
    for (const key of path) base = base?.[key];
    const writes: Write[] = [];
    const changes: StatePath[] = [];
    const revokers: (() => void)[] = [];
    type Node = { base: any; shadow?: any; proxy: any; path: StatePath; array?: StatePath };
    const nodes = new WeakMap<object, Node>();
    const proxies = new WeakMap<object, Node>();
    const opaque = new WeakMap<object, any>();
    const collections = new WeakMap<object, any>();
    const collectionNodes = new WeakMap<object, { shadow: any; modified: boolean }>();
    let active = true;
    const assertActive = () => {
      if (!active) throw new Error('Cannot use an Actionstack draft after its reducer has finished.');
    };
    const unwrap = (value: any): any => proxies.get(value)?.base ?? value;
    const changed = (node: Node, key: PropertyKey) => {
      changes.push(node.array ?? [...node.path, key]);
    };
    const wrap = (value: any, at: StatePath, array?: StatePath): any => {
      if (value === null || typeof value !== 'object') return value;
      if (!isContainer(value)) {
        if (isCollection(value)) {
          const cached = collections.get(value);
          if (cached) return cached;
          const wrapped = wrapCollection(value, at, array);
          collections.set(value, wrapped);
          return wrapped;
        }
        if (opaque.has(value)) return opaque.get(value);
        const deny = () => { throw new Error('Actionstack cannot mutate class instances; replace the whole value.'); };
        const guarded = Proxy.revocable(value, {
          get: (target, key) => {
            let owner = target;
            while (owner) {
              const descriptor = Object.getOwnPropertyDescriptor(owner, key);
              if (descriptor && !('value' in descriptor)) return deny();
              if (descriptor) break;
              owner = Object.getPrototypeOf(owner);
            }
            const item = Reflect.get(target, key, target);
            if (typeof item === 'function') return deny;
            return wrap(item, [...at, key], array);
          },
          set: deny, deleteProperty: deny, defineProperty: deny, setPrototypeOf: deny, preventExtensions: deny,
          getOwnPropertyDescriptor: deny,
        });
        opaque.set(value, guarded.proxy);
        proxies.set(guarded.proxy, { base: value } as Node);
        revokers.push(guarded.revoke);
        return guarded.proxy;
      }
      const cached = nodes.get(value);
      if (cached) return cached.proxy;
      const node: Node = { base: value, proxy: undefined, path: at, array: array ?? (Array.isArray(value) ? at : undefined) };
      const current = () => node.shadow ?? node.base;
      const ensure = () => node.shadow ??= copy(node.base);
      const write = (key: PropertyKey, next: any): boolean => {
        next = unwrap(next);
        const source = current();
        if (Object.hasOwn(source, key) && Object.is(unwrap(source[key]), next)) return true;
        // Mutate only the private shadow. Array length validation happens here.
        Object.defineProperty(ensure(), key, Array.isArray(source) && key === 'length'
          ? { value: next } : { value: next, writable: true, enumerable: true, configurable: true });
        writes.push({ target: node.base, key, value: next });
        changed(node, key);
        return true;
      };
      const handle = Proxy.revocable(Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value)), {
        get: (_target, key) => wrap(Reflect.get(current(), key, node.proxy), [...at, key], node.array),
        set: (_target, key, next) => write(key, next),
        deleteProperty: (_target, key) => {
          if (!Object.hasOwn(current(), key)) return true;
          if (!Reflect.deleteProperty(ensure(), key)) throw new Error('Cannot delete non-configurable state property.');
          writes.push({ target: node.base, key, remove: true });
          changed(node, key);
          return true;
        },
        has: (_target, key) => key in current(),
        ownKeys: () => Reflect.ownKeys(current()),
        getOwnPropertyDescriptor: (_target, key) => {
          const descriptor = Object.getOwnPropertyDescriptor(current(), key);
          if (!descriptor) return undefined;
          return { ...descriptor, configurable: !(Array.isArray(value) && key === 'length'),
            value: wrap(descriptor.value, [...at, key], node.array) };
        },
        defineProperty: (_target, key, descriptor) => {
          if (!('value' in descriptor) || descriptor.get || descriptor.set ||
            descriptor.configurable === false || descriptor.writable === false || descriptor.enumerable === false)
            throw new Error('Actionstack draft properties must be ordinary writable data properties.');
          return write(key, descriptor.value);
        },
        setPrototypeOf: () => { throw new Error('Cannot change a state prototype.'); },
        preventExtensions: () => { throw new Error('Cannot freeze a state draft.'); },
      });
      node.proxy = handle.proxy;
      nodes.set(value, node);
      proxies.set(node.proxy, node);
      revokers.push(handle.revoke);
      return node.proxy;
    };
    const wrapCollection = (value: any, at: StatePath, array?: StatePath): any => {
      // Reject before any proxy read so accessor properties are never evaluated.
      if (Reflect.ownKeys(value).length)
        throw new Error('Actionstack state collections cannot have custom own properties.');
      // A successful stage materializes this shadow into the next working state.
      // Failed stages simply discard their private shadows, including nested edits.
      const shadow: any = value instanceof Date ? new Date(value.getTime())
        : value instanceof Map ? new Map(value) : new Set(value);
      const node = { shadow, modified: false };
      collectionNodes.set(value, node);
      const segment = (key: any): PropertyKey =>
        (typeof key === 'object' && key !== null) || typeof key === 'function' ? '#' : key;
      const member = (item: any, key: any): any => wrap(item, [...at, segment(key)], array);
      const iteratorOf = (items: any[]) => {
        let index = 0;
        return {
          [Symbol.iterator]() { assertActive(); return this; },
          next() {
            assertActive();
            return index < items.length ? { value: items[index++], done: false } : { value: undefined, done: true };
          },
        };
      };
      const storedKey = (input: any): any => {
        input = unwrap(input);
        if (shadow.has(input) || input === null || typeof input !== 'object') return input;
        for (const key of shadow.keys()) if (this.live(key) === this.live(input)) return key;
        return input;
      };
      const methods = new Map<PropertyKey, (...args: any[]) => any>();
      const record = (op: CollectionOp): void => {
        node.modified = true;
        writes.push({ target: value, key: 'size', op });
        changes.push(array ?? at);
      };
      if (value instanceof Map) {
        methods.set('get', (key: any) => member(shadow.get(storedKey(key)), key));
        methods.set('has', (key: any) => shadow.has(storedKey(key)));
        methods.set('set', (key: any, next: any) => {
          const baseKey = storedKey(key);
          const baseNext = unwrap(next);
          if (shadow.has(baseKey) && Object.is(shadow.get(baseKey), baseNext)) return proxy;
          shadow.set(baseKey, baseNext);
          record({ kind: 'insert', key: baseKey, value: baseNext });
          return proxy;
        });
        methods.set('delete', (key: any) => {
          const baseKey = storedKey(key);
          if (!shadow.delete(baseKey)) return false;
          record({ kind: 'remove', key: baseKey });
          return true;
        });
        methods.set('clear', () => { if (!shadow.size) return; shadow.clear(); record({ kind: 'clear' }); });
        methods.set('keys', () => iteratorOf([...shadow.keys()].map(key => member(key, key))));
        methods.set('values', () => iteratorOf([...shadow.values()].map((item, index) => member(item, index))));
        methods.set('entries', () => iteratorOf([...shadow.entries()].map(([key, item]) => [member(key, key), member(item, key)])));
        methods.set(Symbol.iterator, methods.get('entries')!);
        methods.set('forEach', (callback: any, thisArg?: any) => {
          for (const [key, item] of [...shadow.entries()]) callback.call(thisArg, member(item, key), member(key, key), proxy);
        });
      } else if (value instanceof Set) {
        methods.set('has', (item: any) => shadow.has(storedKey(item)));
        methods.set('add', (item: any) => {
          const base = storedKey(item);
          if (shadow.has(base)) return proxy;
          shadow.add(base);
          record({ kind: 'insert', value: base });
          return proxy;
        });
        methods.set('delete', (item: any) => {
          const base = storedKey(item);
          if (!shadow.delete(base)) return false;
          record({ kind: 'remove', key: base });
          return true;
        });
        methods.set('clear', () => { if (!shadow.size) return; shadow.clear(); record({ kind: 'clear' }); });
        methods.set('keys', () => iteratorOf([...shadow].map((item, index) => member(item, index))));
        methods.set('values', methods.get('keys')!);
        methods.set('entries', () => iteratorOf([...shadow].map(item => [member(item, item), member(item, item)])));
        methods.set(Symbol.iterator, methods.get('keys')!);
        methods.set('forEach', (callback: any, thisArg?: any) => {
          for (const item of [...shadow]) callback.call(thisArg, member(item, item), member(item, item), proxy);
        });
      } else {
        for (const name of DATE_READS) methods.set(name, (...args: any[]) => (shadow as any)[name](...args));
        for (const name of DATE_WRITES) methods.set(name, (...args: any[]) => {
          const before = shadow.getTime();
          const result = (shadow as any)[name](...args);
          if (!Object.is(shadow.getTime(), before)) record({ kind: 'time', value: shadow.getTime() });
          return result;
        });
      }
      const unsupported = (key: PropertyKey) => () => {
        throw new Error(`Actionstack does not support '${String(key)}' on state ${value instanceof Date ? 'Date' : value instanceof Map ? 'Map' : 'Set'} values.`);
      };
      const denyProperty = () => { throw new Error('Actionstack state collections must be changed through their methods.'); };
      for (const [key, method] of methods) methods.set(key, (...args: any[]) => {
        assertActive();
        return method(...args);
      });
      const handle = Proxy.revocable(shadow, {
        get: (_target: any, key: PropertyKey) => {
          if (key === 'size') return shadow.size;
          const method = methods.get(key);
          if (method) return method;
          const item = Reflect.get(value, key, value);
          if (typeof item === 'function') return unsupported(key);
          return member(item, key);
        },
        set: denyProperty, deleteProperty: denyProperty, defineProperty: denyProperty,
        setPrototypeOf: denyProperty, preventExtensions: denyProperty,
        has: (_target: any, key: PropertyKey) => key === 'size' || methods.has(key) || key in value,
      });
      let proxy: any;
      proxy = handle.proxy;
      proxies.set(handle.proxy, { base: value } as Node);
      revokers.push(handle.revoke);
      return handle.proxy;
    };
    // Materialize only changed branches; retain mappings to their committed identities.
    const finalized = new WeakMap<object, any>();
    const finalize = (input: any): any => {
      const value = unwrap(input);
      if (isCollection(value)) {
        if (Reflect.ownKeys(value).length)
          throw new Error('Actionstack state collections cannot have custom own properties.');
        if (finalized.has(value)) return finalized.get(value);
        const node = collectionNodes.get(value);
        const source = node?.shadow ?? value;
        let result: any;
        let modified = node?.modified ?? false;
        if (source instanceof Date) result = modified ? new Date(source.getTime()) : value;
        else {
          result = source instanceof Map ? new Map() : new Set();
          finalized.set(value, result);
          if (source instanceof Map) for (const [key, item] of source) {
            const nextKey = finalize(key);
            const nextItem = finalize(item);
            modified ||= nextKey !== key || nextItem !== item;
            result.set(nextKey, nextItem);
          }
          else for (const item of source) {
            const nextItem = finalize(item);
            modified ||= nextItem !== item;
            result.add(nextItem);
          }
          if (!modified) result = value;
        }
        finalized.set(value, result);
        if (result !== value && (node || this.identities.has(value)))
          this.identities.set(result, this.live(value));
        return result;
      }
      if (!isContainer(value)) return value;
      if (finalized.has(value)) return finalized.get(value);
      const node = nodes.get(value);
      const source = node?.shadow ?? value;
      let result = source;
      // Register first so invalid cyclic assignments can be diagnosed by validateTree.
      finalized.set(value, source);
      for (const key of keys(source)) {
        const child = finalize(source[key]);
        if (child !== source[key]) {
          if (result === value) result = copy(value);
          Object.defineProperty(result, key, { value: child, writable: true, enumerable: true, configurable: true });
          this.place(result, key);
        }
      }
      finalized.set(value, result);
      if (result !== value && (node || this.identities.has(value)))
        this.identities.set(result, this.live(value));
      return result;
    };
    try {
      // Find the outermost containing array, including when the recipe targets a slice.
      let parent = this.state;
      let containingArray: StatePath | undefined;
      for (let index = 0; index <= path.length; index++) {
        if (Array.isArray(parent)) { containingArray = path.slice(0, index); break; }
        parent = parent?.[path[index]];
      }
      const draft = wrap(base, path, containingArray);
      const returned = await recipe(draft);
      const replacement = returned !== undefined && returned !== draft;
      if (replacement && writes.length) throw new Error('A reducer cannot both mutate its draft and return replacement state.');
      const next = finalize(replacement ? returned : base);
      // Build a staged root without touching committed ancestors.
      let root = next;
      const installs: Write[] = [];
      if (path.length) {
        const install = (source: any, index: number): any => {
          const original = isContainer(source) ? source : {};
          const result = copy(original);
          this.identities.set(result, this.live(original));
          const key = path[index];
          const child = index === path.length - 1 ? next : install(original[key], index + 1);
          Object.defineProperty(result, key, { value: child, writable: true, configurable: true, enumerable: true });
          this.place(result, key);
          if (index === path.length - 1 ? replacement && !Object.is(next, base) : !isContainer(original[key]))
            installs.push({ target: original, key, value: child });
          return result;
        };
        root = install(this.state, 0);
      }
      // Unchanged stages keep the committed tree untouched; only real edits need the walk.
      if (writes.length || replacement) validateTree(root, new WeakSet(), this.live);
      for (const write of writes) {
        if (write.op) {
          if (write.op.kind === 'insert') {
            write.op.value = finalize(write.op.value);
            if (write.target instanceof Map) write.op.key = finalize(write.op.key);
          }
        } else if (!write.remove) write.value = finalize(write.value);
      }
      this.state = root;
      this.writes.push(...writes, ...installs);
      this.changes.push(...changes);
      if (replacement && !Object.is(next, base)) this.changes.push(containingArray ?? path);
    } finally {
      active = false;
      for (const revoke of revokers) revoke();
    }
  }

  commit(): any {
    // Preflight all targets before the first write, avoiding partial commits.
    for (const write of this.writes) {
      const target = this.live(write.target);
      if (write.op) {
        if (!Object.isExtensible(target)) throw new Error('Actionstack committed state must be mutable.');
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(target, write.key);
      if (write.remove ? descriptor?.configurable === false :
        descriptor ? !('value' in descriptor) || descriptor.writable === false ||
          (descriptor.configurable === false && !(Array.isArray(target) && write.key === 'length')) : !Object.isExtensible(target))
        throw new Error('Actionstack committed state must be mutable.');
      if (Array.isArray(target)) {
        const length = Object.getOwnPropertyDescriptor(target, 'length')!;
        if (!write.remove && typeof write.key === 'string' && /^(0|[1-9][0-9]*)$/.test(write.key) &&
          Number(write.key) >= target.length && Number(write.key) < 2 ** 32 - 1 && !length.writable)
          throw new Error('Actionstack array length must be writable.');
        if (write.key === 'length' && !write.remove && Number(write.value) < target.length) {
          for (const key of Object.getOwnPropertyNames(target)) {
            if (/^(0|[1-9][0-9]*)$/.test(key) && Number(key) >= Number(write.value) &&
              Object.getOwnPropertyDescriptor(target, key)?.configurable === false)
              throw new Error('Actionstack cannot truncate non-configurable array elements.');
          }
        }
      }
    }
    const prepare = (value: any, seen = new WeakSet<object>()): any => {
      const live = this.live(value);
      if (live !== value || seen.has(value)) return live;
      if (isCollection(value)) {
        seen.add(value);
        if (value instanceof Map) {
          let changed = false;
          const entries = [...value].map(([key, item]) => {
            const nextKey = prepare(key, seen);
            const nextItem = prepare(item, seen);
            changed ||= nextKey !== key || nextItem !== item;
            return [nextKey, nextItem];
          });
          if (changed) {
            Map.prototype.clear.call(value);
            for (const [key, item] of entries) Map.prototype.set.call(value, key, item);
          }
        } else if (value instanceof Set) {
          let changed = false;
          const items = [...value].map(item => {
            const next = prepare(item, seen);
            changed ||= next !== item;
            return next;
          });
          if (changed) {
            Set.prototype.clear.call(value);
            for (const item of items) Set.prototype.add.call(value, item);
          }
        }
        return value;
      }
      if (!isContainer(value)) return live;
      seen.add(value);
      for (const key of keys(value)) {
        const child = prepare(value[key], seen);
        if (child !== value[key]) Object.defineProperty(value, key, {
          value: child, writable: true, enumerable: true, configurable: true,
        });
      }
      return value;
    };
    // Resolve all staged references before making any committed write.
    const values = this.writes.map(write => write.remove || write.op ? undefined : prepare(write.value));
    for (const write of this.writes) {
      const op = write.op;
      if (op?.kind === 'insert') {
        op.value = prepare(op.value);
        if (write.target instanceof Map) op.key = prepare(op.key);
      } else if (op?.kind === 'remove') op.key = prepare(op.key);
    }
    // Unwind the staged scaffold: placements mark every slot this batch filled with
    // a new object, so each swaps to its committed identity without walking the tree.
    for (const [parent, keys] of this.placements) {
      for (const key of keys) {
        const child = (parent as any)[key];
        if (child !== null && typeof child === 'object') {
          const liveChild = this.live(child);
          if (liveChild !== child) Object.defineProperty(parent, key, {
            value: liveChild, writable: true, enumerable: true, configurable: true,
          });
        }
      }
    }
    const root = this.live(this.state);
    for (const [index, write] of this.writes.entries()) {
      const target = this.live(write.target);
      if (write.op) {
        applyOp(target, write.op);
        continue;
      }
      if (write.remove) Reflect.deleteProperty(target, write.key);
      else Object.defineProperty(target, write.key, Array.isArray(target) && write.key === 'length'
        ? { value: values[index] } : { value: values[index], writable: true, configurable: true, enumerable: true });
    }
    return root;
  }
}
