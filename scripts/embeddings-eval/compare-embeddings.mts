/**
 * Pakka Agent - Dev 1 Day 0: compare embedding models on Tanglish, Tamil and English.
 *
 * What it does:
 *  1. Embeds the FAQ lines in data.json as "documents".
 *  2. Embeds the test queries as "queries".
 *  3. Ranks FAQ lines for every query by cosine similarity.
 *  4. Prints which model finds the expected FAQ line most often.
 *
 * Run from the repo root (Node 22.18 or newer runs TypeScript directly, no install needed):
 *   node scripts/embeddings-eval/compare-embeddings.mts
 * Only one provider:
 *   node scripts/embeddings-eval/compare-embeddings.mts --only cohere     (or --only voyage)
 *
 * Keys come from scripts/embeddings-eval/.env.local (never commit it). See example.env.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Every path is relative to this file, so the script works from any folder.
const here = dirname(fileURLToPath(import.meta.url));

// ---------- types ----------

type Lang = "en" | "ta-en" | "ta";

interface Faq {
  id: number;
  text: string;
}

interface Query {
  id: number;
  lang: Lang;
  text: string;
  expectedFaqId: number;
}

interface Data {
  faqs: Faq[];
  queries: Query[];
}

interface Provider {
  name: string;
  model: string;
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQueries(texts: string[]): Promise<number[][]>;
}

interface QueryResult {
  queryId: number;
  lang: Lang;
  text: string;
  expectedFaqId: number;
  rankedFaqIds: number[];
  topScore: number;
  expectedScore: number;
  top1: boolean;
  top3: boolean;
}

interface ProviderResult {
  provider: string;
  model: string;
  dimensions: number;
  queries: QueryResult[];
  top1Overall: number;
  top3Overall: number;
  top1ByLang: Record<Lang, string>;
}

// ---------- small helpers ----------

function loadDotEnv(path: string): void {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function envOr(name: string, fallback: string): string {
  const value = process.env[name];
  return value !== undefined && value.trim() !== "" ? value.trim() : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((n) => typeof n === "number");
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postJson(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    if (res.ok) return (await res.json()) as unknown;

    const retryable = res.status === 429 || res.status >= 500;
    const text = await res.text();
    if (!retryable || attempt === maxAttempts) {
      throw new Error(`HTTP ${res.status} from ${url}: ${text.slice(0, 300)}`);
    }
    await sleep(1500 * attempt);
  }
  throw new Error("unreachable");
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error("Vectors have different lengths");
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as number;
    const y = b[i] as number;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// ---------- providers ----------

function voyageProvider(apiKey: string): Provider {
  const baseUrl = envOr("VOYAGE_BASE_URL", "https://api.voyageai.com/v1");
  const model = envOr("VOYAGE_MODEL", "voyage-4");

  async function embed(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
    const all: number[][] = [];
    for (const batch of chunk(texts, 128)) {
      const json = await postJson(`${baseUrl}/embeddings`, apiKey, {
        input: batch,
        model,
        input_type: inputType,
        output_dimension: 1024,
      });
      if (!isRecord(json) || !Array.isArray(json.data)) {
        throw new Error("Unexpected Voyage response shape");
      }
      const rows = json.data
        .map((row: unknown) => {
          if (!isRecord(row) || !isNumberArray(row.embedding) || typeof row.index !== "number") {
            throw new Error("Unexpected Voyage embedding row");
          }
          return { index: row.index, embedding: row.embedding };
        })
        .sort((x, y) => x.index - y.index);
      for (const row of rows) all.push(row.embedding);
    }
    return all;
  }

  return {
    name: "voyage",
    model,
    embedDocuments: (texts) => embed(texts, "document"),
    embedQueries: (texts) => embed(texts, "query"),
  };
}

function cohereProvider(apiKey: string): Provider {
  const baseUrl = envOr("COHERE_BASE_URL", "https://api.cohere.com");
  const model = envOr("COHERE_MODEL", "embed-multilingual-v3.0");

  async function embed(
    texts: string[],
    inputType: "search_document" | "search_query",
  ): Promise<number[][]> {
    const all: number[][] = [];
    for (const batch of chunk(texts, 96)) {
      const json = await postJson(`${baseUrl}/v2/embed`, apiKey, {
        model,
        texts: batch,
        input_type: inputType,
        embedding_types: ["float"],
      });
      if (!isRecord(json) || !isRecord(json.embeddings) || !Array.isArray(json.embeddings.float)) {
        throw new Error("Unexpected Cohere response shape");
      }
      for (const vector of json.embeddings.float as unknown[]) {
        if (!isNumberArray(vector)) throw new Error("Unexpected Cohere embedding row");
        all.push(vector);
      }
    }
    return all;
  }

  return {
    name: "cohere",
    model,
    embedDocuments: (texts) => embed(texts, "search_document"),
    embedQueries: (texts) => embed(texts, "search_query"),
  };
}

// ---------- evaluation ----------

async function evaluate(provider: Provider, data: Data): Promise<ProviderResult> {
  const docVectors = await provider.embedDocuments(data.faqs.map((f) => f.text));
  const queryVectors = await provider.embedQueries(data.queries.map((q) => q.text));

  if (docVectors.length !== data.faqs.length || queryVectors.length !== data.queries.length) {
    throw new Error(`${provider.name}: got a different number of vectors than texts sent`);
  }
  const dimensions = (docVectors[0] as number[]).length;

  const results: QueryResult[] = data.queries.map((query, qi) => {
    const qv = queryVectors[qi] as number[];
    const scored = data.faqs
      .map((faq, fi) => ({ id: faq.id, score: cosine(qv, docVectors[fi] as number[]) }))
      .sort((a, b) => b.score - a.score);
    const rankedFaqIds = scored.map((s) => s.id);
    const expected = scored.find((s) => s.id === query.expectedFaqId);
    return {
      queryId: query.id,
      lang: query.lang,
      text: query.text,
      expectedFaqId: query.expectedFaqId,
      rankedFaqIds,
      topScore: (scored[0] as { score: number }).score,
      expectedScore: expected ? expected.score : 0,
      top1: rankedFaqIds[0] === query.expectedFaqId,
      top3: rankedFaqIds.slice(0, 3).includes(query.expectedFaqId),
    };
  });

  const langs: Lang[] = ["en", "ta-en", "ta"];
  const top1ByLang = {} as Record<Lang, string>;
  for (const lang of langs) {
    const subset = results.filter((r) => r.lang === lang);
    const hits = subset.filter((r) => r.top1).length;
    top1ByLang[lang] = `${hits}/${subset.length}`;
  }

  return {
    provider: provider.name,
    model: provider.model,
    dimensions,
    queries: results,
    top1Overall: results.filter((r) => r.top1).length,
    top3Overall: results.filter((r) => r.top3).length,
    top1ByLang,
  };
}

function printResult(result: ProviderResult, total: number): void {
  console.log(`\n=== ${result.provider} (${result.model}) - ${result.dimensions} dimensions ===`);
  if (result.dimensions !== 1024) {
    console.log("WARNING: the schema is vector(1024); this model returned a different size.");
  }
  for (const q of result.queries) {
    const mark = q.top1 ? "OK  " : q.top3 ? "TOP3" : "MISS";
    console.log(
      `${mark} [${q.lang.padEnd(5)}] #${String(q.queryId).padStart(2)} expected FAQ ${String(
        q.expectedFaqId,
      ).padStart(2)} | got ${q.rankedFaqIds.slice(0, 3).join(",")} | ${q.text}`,
    );
  }
  console.log(
    `Top-1: ${result.top1Overall}/${total}   Top-3: ${result.top3Overall}/${total}   ` +
      `Top-1 by language -> English ${result.top1ByLang.en}, Tanglish ${result.top1ByLang["ta-en"]}, Tamil ${result.top1ByLang.ta}`,
  );
}

function pickWinner(results: ProviderResult[]): string {
  if (results.length === 1) return `Only ${results[0]?.provider} was run, so there is nothing to compare yet.`;
  const score = (r: ProviderResult): number => {
    const mixed = r.queries.filter((q) => q.lang !== "en" && q.top1).length;
    return mixed * 1000 + r.top1Overall * 10 + r.top3Overall;
  };
  const sorted = [...results].sort((a, b) => score(b) - score(a));
  const best = sorted[0] as ProviderResult;
  const second = sorted[1] as ProviderResult;
  if (score(best) === score(second)) {
    return "Tie. Default to Voyage (cheaper after the free tokens), then re-test with Raja's real chats.";
  }
  return `Higher on Tanglish and Tamil top-1: ${best.provider}. Check the MISS lines before deciding.`;
}

// ---------- main ----------

async function main(): Promise<void> {
  loadDotEnv(join(here, ".env.local"));
  const onlyIdx = process.argv.indexOf("--only");
  const only = onlyIdx !== -1 ? process.argv[onlyIdx + 1] : undefined;

  const data = JSON.parse(readFileSync(join(here, "data.json"), "utf8")) as Data;
  if (data.faqs.length === 0 || data.queries.length === 0) {
    throw new Error("data.json needs at least one FAQ and one query");
  }

  const providers: Provider[] = [];
  const voyageKey = process.env.VOYAGE_API_KEY?.trim();
  const cohereKey = process.env.COHERE_API_KEY?.trim();

  if (only === undefined || only === "voyage") {
    if (voyageKey) providers.push(voyageProvider(voyageKey));
    else console.log("Skipping Voyage: VOYAGE_API_KEY is not set in scripts/embeddings-eval/.env.local");
  }
  if (only === undefined || only === "cohere") {
    if (cohereKey) providers.push(cohereProvider(cohereKey));
    else console.log("Skipping Cohere: COHERE_API_KEY is not set in scripts/embeddings-eval/.env.local");
  }
  if (providers.length === 0) throw new Error("No provider to run. Add at least one key to scripts/embeddings-eval/.env.local");

  const results: ProviderResult[] = [];
  for (const provider of providers) {
    try {
      const result = await evaluate(provider, data);
      results.push(result);
      printResult(result, data.queries.length);
    } catch (err) {
      console.log(`\n${provider.name} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (results.length === 0) throw new Error("Every provider failed. See the messages above.");

  console.log(`\nSuggestion: ${pickWinner(results)}`);
  console.log("Reminder: 15 placeholder queries are a first signal, not proof. Re-run with Raja's real chats.");
  writeFileSync(join(here, "results.json"), JSON.stringify(results, null, 2));
  console.log("Saved results.json (safe to share in the team channel; it contains no keys).");
}

main().catch((err: unknown) => {
  console.error(`\nError: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
