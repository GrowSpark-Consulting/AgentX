import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkPacks, describeStartupFailure, formatRetry, formatSyncReport, PACK_STORE_RETRY_DELAYS_MS, PACK_SYNC_BUDGET_MS, PackStoreError, PackSyncError, readPackFiles, syncPacks, type PackStore } from "./sync";
import { samplePack } from "./test-packs";

// Reading packs/*.json and storing them in vertical_packs by (key, version). The store is an in-memory
// fake that behaves like the table: insert-if-absent is atomic, and the stored JSON comes back with its
// keys in another order (as jsonb does). Real files are written to a temporary folder.

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "packs-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const write = (name: string, content: unknown) => writeFile(join(dir, name), typeof content === "string" ? content : JSON.stringify(content, null, 2));
const pack = (key: string, over: Record<string, unknown> = {}) => samplePack({ key, ...over });

/** Reverses the key order, like jsonb does not preserve it. */
function reorder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reorder);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).reverse().map(([k, v]) => [k, reorder(v)]));
  }
  return value;
}

function fakeStore() {
  const rows = new Map<string, { definition: unknown; active: boolean }>();
  const state = { inserts: 0, calls: 0, fail: null as Error | null };
  const store: PackStore = {
    async insertIfAbsent({ key, version, definition, active }) {
      state.calls++;
      await Promise.resolve(); // lets two syncs interleave, as two servers would
      if (state.fail) throw state.fail;
      const id = `${key}@${version}`;
      if (rows.has(id)) return false; // ON CONFLICT DO NOTHING, atomic
      rows.set(id, { definition: reorder(definition), active });
      state.inserts++;
      return true;
    },
    async get(key, version) {
      state.calls++;
      await Promise.resolve();
      if (state.fail) throw state.fail;
      return rows.get(`${key}@${version}`)?.definition ?? null;
    },
  };
  return { store, rows, state };
}

describe("readPackFiles", () => {
  it("reads every .json file and ignores everything else", async () => {
    await write("alpha.json", pack("alpha"));
    await write("beta-two.json", pack("beta-two", { version: 3 }));
    await write("README.md", "# not a pack");
    await write(".gitkeep", "");
    await mkdir(join(dir, "nested"));
    const files = await readPackFiles(dir);
    expect(files.map((f) => [f.file, f.key, f.version])).toEqual([["alpha.json", "alpha", 1], ["beta-two.json", "beta-two", 3]]);
  });

  it("returns nothing for an empty folder", async () => {
    await expect(readPackFiles(dir)).resolves.toEqual([]);
  });

  it("refuses a folder that does not exist, which is a broken deploy", async () => {
    const missing = join(dir, "missing-folder-name");
    const error = await readPackFiles(missing).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PackSyncError);
    expect((error as Error).message).not.toContain("missing-folder-name"); // a server path does not belong in deploy logs
    expect((error as Error).message).not.toContain(tmpdir());
  });

  it("names the file and the field of an invalid pack, and never quotes the pack's own text", async () => {
    // The secret is in the invalid value itself (the field type), which is where a validator would be tempted to quote it.
    await write("broken.json", pack("broken", { label: "SECRET LABEL TEXT", fields: [{ key: "x", label: "Q", type: "SECRET TYPE VALUE" }] }));
    const error = await readPackFiles(dir).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PackSyncError);
    const message = (error as Error).message;
    expect(message).toContain("broken.json");
    expect(message).toContain("fields.0.type");
    expect(message).not.toContain("SECRET LABEL TEXT");
    expect(message).not.toContain("SECRET TYPE VALUE");
  });

  it("reports every invalid file at once, not just the first", async () => {
    await write("one.json", pack("one", { fields: [] }));
    await write("two.json", pack("two", { version: 0 }));
    const message = ((await readPackFiles(dir).catch((e: unknown) => e)) as Error).message;
    expect(message).toContain("one.json");
    expect(message).toContain("two.json");
  });

  it("refuses a file that is not JSON, naming it", async () => {
    await write("bad.json", "{ not json");
    const message = ((await readPackFiles(dir).catch((e: unknown) => e)) as Error).message;
    expect(message).toContain("bad.json");
    expect(message).toMatch(/not valid JSON/i);
  });

  it("requires the file name to be the pack's key, so a pack cannot hide under another name", async () => {
    await write("one.json", pack("two"));
    const message = ((await readPackFiles(dir).catch((e: unknown) => e)) as Error).message;
    expect(message).toContain("one.json");
    expect(message).toContain("key");
  });

  it("passes on what the loader noticed, without failing", async () => {
    await write("alpha.json", pack("alpha", { scoring: { rules: [{ field: "not_a_field", equals: "x", points: 5 }], thresholds: { hot: 70, warm: 40 } } }));
    const files = await readPackFiles(dir);
    expect(files[0].warnings.map((w) => w.code)).toContain("scoring_unknown_field");
  });
});

describe("syncPacks", () => {
  it("fails before touching the store when any pack is invalid", async () => {
    const { store, state } = fakeStore();
    await write("good.json", pack("good"));
    await write("bad.json", pack("bad", { fields: [] }));
    await expect(syncPacks({ dir, store })).rejects.toThrow(PackSyncError);
    expect(state.calls).toBe(0);
  });

  it("stores a new pack as it is written, active, and says so", async () => {
    const { store, rows } = fakeStore();
    await write("alpha.json", pack("alpha"));
    const report = await syncPacks({ dir, store });
    expect(report.packs).toMatchObject([{ key: "alpha", version: 1, file: "alpha.json", outcome: "inserted" }]);
    expect(rows.get("alpha@1")?.active).toBe(true);
    expect(rows.get("alpha@1")?.definition).toEqual(reorder(JSON.parse(JSON.stringify(pack("alpha")))));
  });

  it("changes nothing the second time", async () => {
    const { store, state } = fakeStore();
    await write("alpha.json", pack("alpha"));
    await syncPacks({ dir, store });
    const report = await syncPacks({ dir, store });
    expect(report.packs[0].outcome).toBe("unchanged");
    expect(state.inserts).toBe(1);
  });

  it("stores version 2 beside version 1", async () => {
    const { store, rows } = fakeStore();
    await write("alpha.json", pack("alpha"));
    await syncPacks({ dir, store });
    await write("alpha.json", pack("alpha", { version: 2, label: "Alpha v2" }));
    const report = await syncPacks({ dir, store });
    expect(report.packs[0].outcome).toBe("inserted");
    expect([...rows.keys()].sort()).toEqual(["alpha@1", "alpha@2"]);
  });

  it("refuses a changed definition for a published version, naming the file, the version and what changed", async () => {
    const { store, rows } = fakeStore();
    await write("alpha.json", pack("alpha"));
    await syncPacks({ dir, store });
    const before = JSON.stringify(rows.get("alpha@1"));

    await write("alpha.json", pack("alpha", { scoring: { rules: [{ field: "budget", equals: "x", points: 1 }], thresholds: { hot: 70, warm: 40 } }, label: "Changed" }));
    const error = await syncPacks({ dir, store }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PackSyncError);
    const message = (error as Error).message;
    expect(message).toContain("alpha.json");
    expect(message).toMatch(/version 1/);
    expect(message).toMatch(/version 2/);
    expect(message).toContain("scoring");
    expect(message).toContain("label");
    expect(message).not.toContain("Changed"); // names the parts, never the content
    expect(JSON.stringify(rows.get("alpha@1"))).toBe(before);
  });

  it("does not call a pack changed because of key order or whitespace", async () => {
    const { store } = fakeStore();
    const definition = pack("alpha");
    await write("alpha.json", JSON.stringify(definition));
    await syncPacks({ dir, store });
    await write("alpha.json", JSON.stringify(reorder(definition), null, 8));
    const report = await syncPacks({ dir, store });
    expect(report.packs[0].outcome).toBe("unchanged");
  });

  it("never changes whether an existing version is active", async () => {
    const { store, rows } = fakeStore();
    await write("alpha.json", pack("alpha"));
    await syncPacks({ dir, store });
    rows.get("alpha@1")!.active = false; // switched off by hand
    await syncPacks({ dir, store });
    expect(rows.get("alpha@1")?.active).toBe(false);
  });

  it("is safe when several servers start at once: one inserts, all succeed", async () => {
    const { store, rows, state } = fakeStore();
    await write("alpha.json", pack("alpha"));
    const reports = await Promise.all(Array.from({ length: 5 }, () => syncPacks({ dir, store })));
    expect(state.inserts).toBe(1);
    expect(rows.size).toBe(1);
    expect(reports.flatMap((r) => r.packs.map((p) => p.outcome)).sort()).toEqual(["inserted", "unchanged", "unchanged", "unchanged", "unchanged"]);
  });

  it("lets exactly one of two servers with different definitions for the same version win", async () => {
    const { store, rows } = fakeStore();
    const dirB = await mkdtemp(join(tmpdir(), "packs-"));
    try {
      await write("alpha.json", pack("alpha", { label: "From A" }));
      await writeFile(join(dirB, "alpha.json"), JSON.stringify(pack("alpha", { label: "From B" })));
      const results = await Promise.allSettled([syncPacks({ dir, store }), syncPacks({ dir: dirB, store })]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(failed?.reason).toBeInstanceOf(PackSyncError);
      expect((failed?.reason as Error).message).toMatch(/already published/i);
      expect(rows.size).toBe(1);
    } finally {
      await rm(dirB, { recursive: true, force: true });
    }
  });

  it("reports a store failure in fixed words, without the store's own message", async () => {
    const { store, state } = fakeStore();
    state.fail = new Error("connection to 10.0.0.5 failed for user postgres with password hunter2");
    await write("alpha.json", pack("alpha"));
    const error = await syncPacks({ dir, store, retry: { delaysMs: [], sleep: async () => undefined } }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PackSyncError);
    expect((error as Error).message).not.toContain("hunter2");
    expect((error as Error).message).not.toContain("10.0.0.5");
  });
});

describe("syncPacks when the store is briefly unavailable", () => {
  const blip = () => new PackStoreError("The pack store could not be reached (database error 08006).", true, "08006");

  /** A store that fails `failures` times in a row, then works like fakeStore. */
  function flakyStore(failures: number, error: Error = blip()) {
    const inner = fakeStore();
    const state = { calls: 0, failures };
    const store: PackStore = {
      async insertIfAbsent(row) {
        state.calls++;
        if (state.failures > 0) {
          state.failures--;
          throw error;
        }
        return inner.store.insertIfAbsent(row);
      },
      get: (key, version) => inner.store.get(key, version),
    };
    return { store, state, rows: inner.rows };
  }

  /** A clock that only the sleeps move, as if every try failed instantly. */
  function fakeClock() {
    const clock = { t: 0, waits: [] as number[] };
    return { clock, retry: { now: () => clock.t, sleep: async (ms: number) => void ((clock.t += ms), clock.waits.push(ms)) } };
  }

  it("waits 35 seconds in all, never shrinking, inside a budget that leaves room for the last try to finish before Railway's 60 s healthcheck", () => {
    expect(PACK_STORE_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0)).toBe(35_000);
    PACK_STORE_RETRY_DELAYS_MS.forEach((delay, i) => {
      if (i > 0) expect(delay).toBeGreaterThanOrEqual(PACK_STORE_RETRY_DELAYS_MS[i - 1]);
    });
    expect(PACK_SYNC_BUDGET_MS).toBe(40_000);
    expect(PACK_SYNC_BUDGET_MS).toBeGreaterThan(PACK_STORE_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0)); // the budget is not the delays' own total
    expect(PACK_SYNC_BUDGET_MS + 2 * 5000).toBeLessThan(60_000); // a try that starts in time ends before the healthcheck
  });

  it("retries a transient failure and then succeeds, reporting each wait", async () => {
    const { store, state, rows } = flakyStore(2);
    await write("alpha.json", pack("alpha"));
    const waits: number[] = [];
    const onRetry = vi.fn();
    const report = await syncPacks({ dir, store, retry: { sleep: async (ms) => void waits.push(ms), onRetry } });
    expect(report.packs[0].outcome).toBe("inserted");
    expect(state.calls).toBe(3);
    expect(waits).toEqual(PACK_STORE_RETRY_DELAYS_MS.slice(0, 2));
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith({ attempt: 1, delayMs: PACK_STORE_RETRY_DELAYS_MS[0], code: "08006" });
    expect(rows.size).toBe(1);
  });

  it("gives up when the budget runs out, with the clock moving as it does in production, and says how long it tried", async () => {
    const { store, state } = flakyStore(1000);
    await write("alpha.json", pack("alpha"));
    const { clock, retry } = fakeClock();
    const error = await syncPacks({ dir, store, retry }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PackSyncError);
    const message = (error as Error).message;
    expect(message).toMatch(/database error 08006/);
    // waits of 1, 2, 4, 8 and 10 s are 25 s; the sixth, of 10 s, would end at 35 s, still inside 40 s
    expect(clock.waits).toEqual([...PACK_STORE_RETRY_DELAYS_MS]);
    expect(state.calls).toBe(PACK_STORE_RETRY_DELAYS_MS.length + 1);
    expect(message).toMatch(new RegExp(`Tried ${PACK_STORE_RETRY_DELAYS_MS.length + 1} times; gave up 35 seconds after the server started`));
  });

  it("stops early when each try itself takes time, so the real elapsed time (not the sum of the waits) decides", async () => {
    const inner = flakyStore(1000);
    await write("alpha.json", pack("alpha"));
    const { clock, retry } = fakeClock();
    const store: PackStore = {
      insertIfAbsent: async (row) => {
        clock.t += 8000; // a try that fails after 8 s
        return inner.store.insertIfAbsent(row);
      },
      get: inner.store.get,
    };
    const error = await syncPacks({ dir, store, retry }).catch((e: unknown) => e);
    expect((error as Error).message).toMatch(/gave up \d+ seconds after/);
    // each try fails after 8 s: the waits add up to far less than the time spent, and it is the time spent that stops it
    // (the last try begins before 40 s and ends before the 60 s healthcheck)
    expect(clock.t).toBeLessThan(60_000);
    expect(inner.state.calls).toBeLessThan(PACK_STORE_RETRY_DELAYS_MS.length + 1);
  });

  it("counts the time the process spent starting up against the budget", async () => {
    const { store, state } = flakyStore(1000);
    await write("alpha.json", pack("alpha"));
    const { retry } = fakeClock();
    await syncPacks({ dir, store, retry: { ...retry, elapsedBeforeMs: 30_000 } }).catch(() => undefined);
    // 30 s already gone: the 1 s, 2 s and 4 s waits fit (to 37 s), the 8 s wait would end at 45 s
    expect(state.calls).toBe(4);
  });

  it("tells the log why each wait happens, with the fixed token only", () => {
    expect(formatRetry({ attempt: 2, delayMs: 2000, code: "http_503" })).toBe("[packs] the pack store is unavailable (try 2, http_503); trying again in 2s");
  });

  it("does not retry a refusal that waiting cannot fix, such as missing permission", async () => {
    const { store, state } = flakyStore(1000, new PackStoreError("The pack store refused the write (database error 42501).", false));
    await write("alpha.json", pack("alpha"));
    const sleep = vi.fn(async () => undefined);
    const error = await syncPacks({ dir, store, retry: { sleep } }).catch((e: unknown) => e);
    expect((error as Error).message).toMatch(/42501/);
    expect(state.calls).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("stops retrying once the whole sync has used its time budget, so the deploy's healthcheck is not outwaited", async () => {
    const { store, state } = flakyStore(1000);
    await write("alpha.json", pack("alpha"));
    let clock = 0;
    const error = await syncPacks({
      dir,
      store,
      retry: { sleep: async (ms) => void (clock += ms), now: () => clock, budgetMs: 10_000 },
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PackSyncError);
    // waits of 1 s, 2 s and 4 s fit in 10 s; the next 8 s would not
    expect(state.calls).toBe(4);
  });

  it("does not retry a changed published version", async () => {
    const { store, state } = fakeStore();
    await write("alpha.json", pack("alpha"));
    await syncPacks({ dir, store });
    await write("alpha.json", pack("alpha", { label: "Changed" }));
    const callsBefore = state.calls;
    const sleep = vi.fn(async () => undefined);
    await expect(syncPacks({ dir, store, retry: { sleep } })).rejects.toThrow(/already published/);
    expect(sleep).not.toHaveBeenCalled();
    expect(state.calls - callsBefore).toBe(2); // one insert attempt and one read, no more
  });

  it("does not retry an invalid pack, and never reaches the store", async () => {
    const { store, state } = flakyStore(0);
    await write("alpha.json", pack("alpha", { fields: [] }));
    const sleep = vi.fn(async () => undefined);
    await expect(syncPacks({ dir, store, retry: { sleep } })).rejects.toThrow(PackSyncError);
    expect(state.calls).toBe(0);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("treats a surprise error from the store as a blip too, without quoting it", async () => {
    const { store, state } = flakyStore(1, new Error("socket hang up to 10.0.0.5 password hunter2"));
    await write("alpha.json", pack("alpha"));
    const report = await syncPacks({ dir, store, retry: { sleep: async () => undefined } });
    expect(report.packs[0].outcome).toBe("inserted");
    expect(state.calls).toBe(2);
  });

  it("gives each pack its own tries, while the time budget is shared by all", async () => {
    // Every pack's first insert fails once, then works.
    const inner = fakeStore();
    const failedOnce = new Set<string>();
    const calls: string[] = [];
    const store: PackStore = {
      async insertIfAbsent(row) {
        calls.push(row.key);
        if (!failedOnce.has(row.key)) {
          failedOnce.add(row.key);
          throw blip();
        }
        return inner.store.insertIfAbsent(row);
      },
      get: inner.store.get,
    };
    await write("alpha.json", pack("alpha"));
    await write("beta.json", pack("beta"));
    const { clock, retry } = fakeClock();
    const report = await syncPacks({ dir, store, retry });
    expect(report.packs.map((p) => p.outcome)).toEqual(["inserted", "inserted"]);
    expect(calls).toEqual(["alpha", "alpha", "beta", "beta"]);
    expect(clock.waits).toEqual([PACK_STORE_RETRY_DELAYS_MS[0], PACK_STORE_RETRY_DELAYS_MS[0]]); // the second pack starts again at the first delay

    // The budget, though, is one for the whole sync: once the first pack has used it up, the second gets no retry.
    const slow = flakyStore(1000);
    const spent = fakeClock();
    const failure = await syncPacks({ dir, store: slow.store, retry: { ...spent.retry, budgetMs: 2000 } }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(PackSyncError);
    expect(slow.state.calls).toBe(2); // alpha: one try, a 1 s wait, a second try, then 2 s would pass the budget
  });
});

describe("checkPacks", () => {
  it("validates the files and reports warnings, with no store at all", async () => {
    await write("alpha.json", pack("alpha"));
    const report = await checkPacks(dir);
    expect(report.map((p) => [p.key, p.version])).toEqual([["alpha", 1]]);
  });

  it("fails on an invalid pack, like startup does", async () => {
    await write("alpha.json", pack("alpha", { fields: [] }));
    await expect(checkPacks(dir)).rejects.toThrow(PackSyncError);
  });
});

describe("what is printed", () => {
  it("lists each pack with what happened to it", async () => {
    const { store } = fakeStore();
    await write("alpha.json", pack("alpha"));
    const lines = formatSyncReport(await syncPacks({ dir, store }));
    expect(lines.join("\n")).toMatch(/alpha@1.*inserted/);
  });

  it("shows a pack error as it is, and anything else by its type only", () => {
    expect(describeStartupFailure(new PackSyncError("packs/alpha.json: fields.0.type: invalid"))).toContain("packs/alpha.json: fields.0.type");
    const text = describeStartupFailure(new TypeError("token abc123 leaked here"));
    expect(text).not.toContain("abc123");
    expect(text).toContain("TypeError");
  });
});
