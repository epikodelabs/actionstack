import { atom, createSubscription, NO_INITIAL_VALUE, type Atom, type Subscription } from '@epikodelabs/streamix';
import { DATE_READS, isCollection, isContainer, overlaps, prefix, type StatePath } from './mutations';

type Dependency = { path: StatePath; subtree: boolean };
type Listener = (changes: StatePath[]) => Promise<void> | void;

/** One registry per store; disconnected selectors do not retain dependencies. */
export function createSelectorRegistry(getState: () => any) {
  const listeners = new Set<Listener>();
  const pending = new Set<Promise<unknown>>();
  const track = <R>(selector: (state: any) => R | Promise<R>, defaultValue?: R): Atom<R> => {
    let dependencies: Dependency[] = [];
    let active = false;
    let dirty = false;
    let generation = 0;
    let task: Promise<R> | undefined;
    const connectionTasks = new Set<Promise<unknown>>();
    const evaluate = (): R | Promise<R> => {
      const version = generation;
      const observing = active;
      const reads: Dependency[] = [];
      dependencies = reads;
      dirty = false;
      const proxyInfo = new WeakMap<object, { path: StatePath; read: () => any }>();
      const proxyCache = new WeakMap<object, any>();
      const readAt = (path: StatePath): any => {
        let value = getState();
        for (const key of path) value = value?.[key];
        return value;
      };
      const depend = (path: StatePath, subtree: boolean) => {
        if (active && version === generation && dependencies === reads) reads.push({ path, subtree });
      };
      const readonly = () => { throw new Error('Selectors must not mutate state.'); };
      const segment = (key: any): PropertyKey =>
        (typeof key === 'object' && key !== null) || typeof key === 'function' ? '#' : key;
      const strip = (item: any): any => proxyInfo.has(item) ? proxyInfo.get(item)!.read() : item;
      const wrap = (path: StatePath, array?: StatePath): any => wrapValue(readAt(path), path, array);
      const wrapValue = (value: any, path: StatePath, array?: StatePath, resolve?: () => any): any => {
        const live = resolve ?? (() => readAt(path));
        if (array) depend(array, true);
        if (value === null || typeof value !== 'object') return value;
        if (proxyCache.has(value)) return proxyCache.get(value);
        if (!isContainer(value)) {
          depend(path, true);
          if (isCollection(value)) {
            // Collections invalidate as a whole, matching arrays; methods read live state.
            const iteratorOf = (items: any[]) => (function* () { yield* items; })();
            const wrapMember = (item: any, key: any, fetch?: () => any): any =>
              item !== null && typeof item === 'object'
                ? wrapValue(item, [...path, segment(key)], array, fetch ?? (() => item)) : item;
            const methods = new Map<PropertyKey, (...args: any[]) => any>();
            if (value instanceof Map) {
              methods.set('get', (key: any) => {
                const base = strip(key);
                return wrapMember(live()?.get(base), key, () => live()?.get(base));
              });
              methods.set('has', (key: any) => live()?.has(strip(key)) ?? false);
              methods.set('keys', () => iteratorOf([...(live()?.keys() ?? [])].map(key => wrapMember(key, key))));
              methods.set('values', () => iteratorOf([...(live()?.entries() ?? [])]
                .map(([key, item]) => wrapMember(item, key, () => live()?.get(key)))));
              methods.set('entries', () => iteratorOf([...(live()?.entries() ?? [])]
                .map(([key, item]) => [wrapMember(key, key), wrapMember(item, key, () => live()?.get(key))])));
              methods.set(Symbol.iterator, methods.get('entries')!);
              methods.set('forEach', (callback: any, thisArg?: any) => {
                for (const [key, item] of [...(live()?.entries() ?? [])])
                  callback.call(thisArg, wrapMember(item, key, () => live()?.get(key)), wrapMember(key, key), proxy);
              });
            } else if (value instanceof Set) {
              methods.set('has', (item: any) => live()?.has(strip(item)) ?? false);
              methods.set('keys', () => iteratorOf([...(live() ?? [])].map((item, index) => wrapMember(item, index))));
              methods.set('values', methods.get('keys')!);
              methods.set('entries', () => iteratorOf([...(live() ?? [])]
                .map((item, index) => [wrapMember(item, index), wrapMember(item, index)])));
              methods.set(Symbol.iterator, methods.get('keys')!);
              methods.set('forEach', (callback: any, thisArg?: any) => {
                for (const item of [...(live() ?? [])])
                  callback.call(thisArg, wrapMember(item, item), wrapMember(item, item), proxy);
              });
            } else {
              for (const name of DATE_READS) methods.set(name, (...args: any[]) => (live() as any)?.[name](...args));
            }
            const proxy = new Proxy(value, {
              get: (_target: any, key: PropertyKey) => {
                if (key === 'size') return live()?.size;
                const method = methods.get(key);
                if (method) return method;
                const current = live() ?? value;
                let owner = current;
                while (owner) {
                  const descriptor = Object.getOwnPropertyDescriptor(owner, key);
                  if (descriptor && !('value' in descriptor)) return readonly();
                  if (descriptor) break;
                  owner = Object.getPrototypeOf(owner);
                }
                const item = Reflect.get(current, key, current);
                if (typeof item === 'function') return readonly;
                return wrapMember(item, key, () => Reflect.get(live() ?? value, key));
              },
              set: readonly, deleteProperty: readonly, defineProperty: readonly,
              setPrototypeOf: readonly, preventExtensions: readonly,
              getOwnPropertyDescriptor: readonly,
            });
            proxyInfo.set(proxy, { path, read: live });
            proxyCache.set(value, proxy);
            return proxy;
          }
          // Opaque state is not supported for fine-grained reads. Guard its methods.
          const proxy = new Proxy(value, {
            get: (target, key) => {
              let owner = target;
              while (owner) {
                const descriptor = Object.getOwnPropertyDescriptor(owner, key);
                if (descriptor && !('value' in descriptor)) return readonly();
                if (descriptor) break;
                owner = Object.getPrototypeOf(owner);
              }
              const item = Reflect.get(target, key, target);
              if (typeof item === 'function') return readonly;
              if (item && typeof item === 'object') return readonly();
              return item;
            },
            set: readonly, deleteProperty: readonly, defineProperty: readonly,
            setPrototypeOf: readonly, preventExtensions: readonly,
            getOwnPropertyDescriptor: readonly,
          });
          proxyInfo.set(proxy, { path, read: live });
          proxyCache.set(value, proxy);
          return proxy;
        }
        const containingArray = array ?? (Array.isArray(value) ? path : undefined);
        if (containingArray) depend(containingArray, true);
        const proxy = new Proxy(Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value)), {
          get: (_target, key) => {
            const childPath = [...path, key];
            const child = live()?.[key];
            depend(childPath, !isContainer(child));
            return wrapValue(child, childPath, containingArray, () => live()?.[key]);
          },
          has: (_target, key) => {
            depend([...path, key], false);
            return key in (live() ?? {});
          },
          ownKeys: () => { depend(path, true); return Reflect.ownKeys(live() ?? {}); },
          getOwnPropertyDescriptor: (_target, key) => {
            const descriptor = Object.getOwnPropertyDescriptor(live() ?? {}, key);
            if (!descriptor) return undefined;
            depend([...path, key], false);
            return { ...descriptor, configurable: !(Array.isArray(value) && key === 'length'),
              value: wrapValue(descriptor.value, [...path, key], containingArray, () => live()?.[key]) };
          },
          set: readonly, deleteProperty: readonly, defineProperty: readonly,
          setPrototypeOf: readonly, preventExtensions: readonly,
        });
        proxyInfo.set(proxy, { path, read: live });
        proxyCache.set(value, proxy);
        return proxy;
      };
      const unwrap = (value: any, seen = new WeakMap<object, any>()): any => {
        if (!value || typeof value !== 'object') return value;
        const info = proxyInfo.get(value);
        if (info) { depend(info.path, true); return info.read(); }
        if (value instanceof Map) {
          if (seen.has(value)) return seen.get(value);
          const result = new Map();
          seen.set(value, result);
          let changed = false;
          for (const [key, item] of value) {
            const nextKey = unwrap(key, seen);
            const nextItem = unwrap(item, seen);
            changed ||= nextKey !== key || nextItem !== item;
            result.set(nextKey, nextItem);
          }
          return changed ? result : value;
        }
        if (value instanceof Set) {
          if (seen.has(value)) return seen.get(value);
          const result = new Set();
          seen.set(value, result);
          let changed = false;
          for (const item of value) {
            const next = unwrap(item, seen);
            changed ||= next !== item;
            result.add(next);
          }
          return changed ? result : value;
        }
        if (!isContainer(value)) return value;
        if (seen.has(value)) return seen.get(value);
        const result = Array.isArray(value) ? new Array(value.length) : Object.create(Object.getPrototypeOf(value));
        seen.set(value, result);
        let changed = false;
        for (const key of Reflect.ownKeys(value)) {
          if (Array.isArray(value) && key === 'length') continue;
          const child = unwrap(value[key], seen);
          changed ||= child !== value[key];
          Object.defineProperty(result, key, { value: child, writable: true, enumerable: true, configurable: true });
        }
        return changed ? result : value;
      };
      const normalize = (value: any): R => unwrap(value === undefined ? defaultValue : value);
      const fallback = (error: any): R => {
        console.warn(`Error in selector: ${error?.message ?? error}`);
        // Failed reads can be conditional; retry on any subsequent commit.
        depend([], true);
        return defaultValue as R;
      };
      // Even constant/default selections must recover when the root is replaced.
      depend([], false);
      try {
        const selected = getState() == null ? defaultValue : selector(wrap([]));
        if (selected != null && typeof (selected as PromiseLike<R>).then === 'function') {
          const resolution: Promise<R> = Promise.resolve(selected).then(normalize).catch(fallback).then(value => {
            if (task === resolution) task = undefined;
            if (observing && active && version === generation && dirty) return evaluate();
            return value;
          });
          // A cold synchronous read may encounter an async selector. It is
          // intentionally not connected: do not put that unresolved pull into
          // the registry's active work or let it interfere with the first
          // subscribed evaluation. The promise normalizes its own failures.
          if (observing) {
            task = resolution;
            pending.add(resolution);
            connectionTasks.add(resolution);
            const remove = () => { pending.delete(resolution); connectionTasks.delete(resolution); };
            void resolution.then(remove, remove);
          }
          return resolution;
        }
        return normalize(selected);
      } catch (error) { return fallback(error); }
    };
    // Streamix owns the selected value, replay, error channel and subscriber
    // delivery. Actionstack owns only dependency tracking and connection timing.
    // There is no second value cache or intermediary current-value source.
    const cache = atom<R>();
    let count = 0;
    let disposed = false;
    let connection = 0;
    let pendingSelection = false;
    const waiting = new Set<{ active: boolean }>();

    const equalPrimitive = (previous: R, next: R) =>
      (next === null || typeof next !== 'object') && Object.is(previous, next);

    const publish = (candidate: R | Promise<R>, epoch: number): void => {
      const isPromise = candidate != null && typeof (candidate as PromiseLike<R>).then === 'function';
      pendingSelection = isPromise;
      const accept = (value: R) => {
        if (!active || disposed || epoch !== connection) return;
        pendingSelection = false;
        // A confirmed equal result must still reach subscribers who joined
        // while the result was pending. Their stale cache replay was withheld.
        if (!waiting.size && cache.safeValue !== NO_INITIAL_VALUE &&
            equalPrimitive(cache.safeValue, value)) return;
        cache.next(value);
      };
      if (isPromise) {
        void Promise.resolve(candidate).then(accept, error => {
          if (active && !disposed && epoch === connection) {
            pendingSelection = false;
            cache.fail(error);
          }
        });
      } else {
        accept(candidate as R);
      }
    };

    const evaluateAndPublish = (epoch: number): Promise<void> | void => {
      const value = evaluate();
      publish(value, epoch);
      if (value != null && typeof (value as PromiseLike<R>).then === 'function')
        return Promise.resolve(value).then(() => undefined);
    };

    const listen: Listener = changes => {
      if (!active || disposed) return;
      if (task) {
        dirty = true;
        // The currently resolving evaluation will rerun against the latest
        // state and publish only the confirmed result.
        return task.then(() => undefined);
      }
      if (!dependencies.some(dependency => changes.some(change => dependency.subtree
        ? overlaps(dependency.path, change) : prefix(change, dependency.path)))) return;
      return evaluateAndPublish(connection);
    };

    const start = () => {
      if (active || disposed) return;
      active = true;
      const epoch = ++connection;
      listeners.add(listen);
      evaluateAndPublish(epoch);
    };

    const stop = () => {
      if (!active) return;
      active = false;
      pendingSelection = false;
      connection++;
      generation++;
      for (const resolution of connectionTasks) pending.delete(resolution);
      connectionTasks.clear();
      task = undefined;
      dependencies = [];
      listeners.delete(listen);
      waiting.clear();
    };

    // This is a facade over the *same* native atom: no additional atom or
    // selected-value cache is allocated. Only connection ownership is custom.
    const source = Object.create(cache) as Atom<R>;

    // Reading a cold tracked selector is a pull, not a subscription. Compute
    // synchronously from the current store state and seed the one native atom;
    // do not keep path listeners alive when there are no subscribers.
    // Async selections still have no synchronous value while pending.
    const readCold = (safe = false): R => {
      if (disposed || count > 0) return safe ? cache.safeValue : cache.value;
      const candidate = evaluate();
      if (candidate != null && typeof (candidate as PromiseLike<R>).then === 'function') {
        // The selection cannot be resolved synchronously. Its promise already
        // normalizes errors in evaluate(); only an active subscription may
        // publish a completion. In particular, a cold read must not race a
        // subsequent subscribed evaluation or publish stale state.
        return safe ? cache.safeValue : NO_INITIAL_VALUE as R;
      }
      const value = candidate as R;
      if (cache.safeValue === NO_INITIAL_VALUE || !Object.is(cache.safeValue, value)) {
        cache.next(value);
      }
      return cache.value;
    };
    Object.defineProperties(source, {
      value: { get: () => readCold() },
      safeValue: { get: () => {
        try { return readCold(true); }
        catch { return cache.safeValue; }
      } },
    });

    source.subscribe = callback => {
      if (disposed) return createSubscription(() => {});
      count++;
      if (count === 1) start();
      const observer = { active: true };
      const skipStale = pendingSelection && cache.safeValue !== NO_INITIAL_VALUE;
      if (skipStale) waiting.add(observer);
      let replay = skipStale;
      let hasDelivered = false;
      let last: R | undefined;
      // Streamix serializes async callbacks and replays its own current value.
      const inner: Subscription = cache.subscribe((current, previous) => {
        if (!observer.active) return;
        if (replay) { replay = false; return; }
        waiting.delete(observer);
        // A primitive can be re-emitted to confirm a pending selection; don't
        // deliver it again to consumers that already observed that value.
        if (hasDelivered && equalPrimitive(last as R, current)) return;
        hasDelivered = true;
        last = current;
        return callback?.(current, previous);
      });
      return createSubscription(() => {
        observer.active = false;
        waiting.delete(observer);
        const closing = inner();
        count--;
        if (count === 0) stop(); // synchronous: old teardown cannot stop a new connection
        return closing;
      });
    };
    source.dispose = () => {
      if (disposed) return;
      disposed = true;
      stop();
      cache.dispose();
    };
    (source as Atom<R> & { isPending: () => boolean }).isPending = () => pendingSelection;
    return source;

  };
  return {
    track,
    notify(changes: StatePath[]): Promise<void> {
      // Remove duplicate and descendant paths without stringifying keys.
      const paths = changes.filter((path, index) => !changes.some((other, otherIndex) =>
        otherIndex !== index && prefix(other, path) && (other.length < path.length || otherIndex < index)));
      const completions = [...listeners].map(listener => listener(paths));
      return Promise.all(completions).then(() => undefined);
    },
    async settled(): Promise<void> {
      while (pending.size) await Promise.all([...pending]);
    },
  };
}
