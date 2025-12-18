import { action, createModule, createStore, selector } from "@actioncrew/actionstack";

function nextValue<T>(stream: any): Promise<T> {
  return new Promise<T>((resolve) => {
    const sub = stream.subscribe({
      next: (v: T) => {
        sub.unsubscribe();
        resolve(v);
      },
    });
  });
}

describe("moduleData", () => {
  beforeEach(() => {
    spyOn(console, "log").and.stub();
    spyOn(console, "warn").and.stub();
    spyOn(console, "error").and.stub();
  });

  it("emits selected values and completes when module is unloaded", async () => {
    const store = createStore<any>();

    const mod = createModule({
      slice: "mdata",
      initialState: { count: 0 },
      actions: {
        inc: action("INC", (state: any) => ({ count: (state?.count ?? 0) + 1 })),
      },
      selectors: {
        count: selector((s: any) => s.count),
      },
    });

    await store.loadModule(mod);
    await store.dispatch({ type: "TEST/FLUSH" });

    const stream = mod.data$.count();

    expect(await nextValue<number>(stream)).toBe(0);
    await store.dispatch({ type: "mdata/INC" });
    expect(await nextValue<number>(stream)).toBe(1);

    let completed = false;
    const sub = stream.subscribe({
      next: () => {},
      complete: () => {
        completed = true;
      },
    });

    await store.unloadModule(mod, true);
    await new Promise<void>((r) => setTimeout(r, 0));

    expect(completed).toBeTrue();
    sub.unsubscribe();
  });
});
