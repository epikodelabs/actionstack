import { createSubscription, type Atom } from '@epikodelabs/streamix';
import { createCurrentSource } from './current-source';
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
            if (active && version === generation && dirty) return evaluate();
            return value;
          });
          task = resolution;
          pending.add(resolution);
          connectionTasks.add(resolution);
          const remove = () => { pending.delete(resolution); connectionTasks.delete(resolution); };
          void resolution.then(remove, remove);
          return resolution;
        }
        return normalize(selected);
      } catch (error) { return fallback(error); }
    };
    return createCurrentSource<R>({
      equals: (previous, next) => (next === null || typeof next !== 'object') && Object.is(previous, next),
      connect: emit => {
        active = true;
        const listen: Listener = changes => {
          if (task) { dirty = true; return task.then(() => undefined); }
          if (!dependencies.some(dependency => changes.some(change => dependency.subtree
            ? overlaps(dependency.path, change) : prefix(change, dependency.path)))) return;
          const value = evaluate();
          emit(value);
          if (value != null && typeof (value as PromiseLike<R>).then === 'function')
            return Promise.resolve(value).then(() => undefined);
          return;
        };
        listeners.add(listen);
        emit(evaluate());
        return createSubscription(() => {
          active = false;
          generation++;
          for (const resolution of connectionTasks) pending.delete(resolution);
          connectionTasks.clear();
          task = undefined;
          dependencies = [];
          listeners.delete(listen);
        });
      },
    });
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
