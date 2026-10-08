import { describe, expect, it, vi } from "vitest";
import { cachedPackLoader } from "./runtime";

// A published pack version never changes (agent/packs/sync.ts refuses an edit), so its definition is read from the
// database once per process and then served from memory. A pack that is missing is not remembered: it may be
// published a moment later.

describe("cachedPackLoader", () => {
  it("reads a pack once, then serves it from memory", async () => {
    const get = vi.fn(async () => ({ key: "k", version: 1 }));
    const load = cachedPackLoader({ get });
    expect(await load("k", 1)).toEqual({ key: "k", version: 1 });
    expect(await load("k", 1)).toEqual({ key: "k", version: 1 });
    expect(get).toHaveBeenCalledOnce();
  });

  it("serves a frozen definition, so one turn cannot change what the next one reads", async () => {
    const load = cachedPackLoader({ get: async () => ({ key: "k", fields: [{ key: "budget" }] }) });
    const definition = (await load("k", 1)) as { key: string; fields: { key: string }[] };
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.fields[0])).toBe(true);
    expect(() => {
      "use strict";
      definition.fields.push({ key: "x" });
    }).toThrow();
  });

  it("keeps each key and version apart", async () => {
    const get = vi.fn(async (key: string, version: number) => ({ key, version }));
    const load = cachedPackLoader({ get });
    await load("a", 1);
    await load("a", 2);
    await load("b", 1);
    expect(get).toHaveBeenCalledTimes(3);
  });

  it("does not remember a pack that is not there", async () => {
    const get = vi.fn<() => Promise<unknown | null>>().mockResolvedValueOnce(null).mockResolvedValueOnce({ key: "k", version: 1 });
    const load = cachedPackLoader({ get });
    expect(await load("k", 1)).toBeNull();
    expect(await load("k", 1)).toEqual({ key: "k", version: 1 });
  });

  it("does not remember a failure", async () => {
    const get = vi.fn<() => Promise<unknown | null>>().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce({ key: "k", version: 1 });
    const load = cachedPackLoader({ get });
    await expect(load("k", 1)).rejects.toThrow("down");
    expect(await load("k", 1)).toEqual({ key: "k", version: 1 });
  });

  it("keeps at most 200 packs, dropping the oldest, so a bug cannot grow it without end", async () => {
    const get = vi.fn(async (key: string) => ({ key }));
    const load = cachedPackLoader({ get });
    for (let i = 0; i < 205; i++) await load(`pack-${i}`, 1);
    get.mockClear();
    await load("pack-204", 1); // recent: still there
    expect(get).not.toHaveBeenCalled();
    await load("pack-0", 1); // oldest: dropped, read again
    expect(get).toHaveBeenCalledOnce();
  });
});
