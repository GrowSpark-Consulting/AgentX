import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkPacks, describeStartupFailure, formatSyncReport, PackSyncError, readPackFiles, syncPacks, type PackStore } from "./sync";
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
    await expect(readPackFiles(join(dir, "missing"))).rejects.toThrow(PackSyncError);
  });

  it("names the file and the field of an invalid pack, and never quotes the pack's own text", async () => {
    await write("broken.json", pack("broken", { label: "SECRET LABEL TEXT", fields: [{ key: "x", label: "Q", type: "nonsense" }] }));
    const error = await readPackFiles(dir).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PackSyncError);
    const message = (error as Error).message;
    expect(message).toContain("broken.json");
    expect(message).toContain("fields.0.type");
    expect(message).not.toContain("SECRET LABEL TEXT");
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
    const error = await syncPacks({ dir, store }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PackSyncError);
    expect((error as Error).message).not.toContain("hunter2");
    expect((error as Error).message).not.toContain("10.0.0.5");
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
