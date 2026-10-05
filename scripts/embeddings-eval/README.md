# Embeddings evaluation (Day 0, Dev 1)

A throwaway-but-repeatable check that compares embedding models on English, Tamil and Tanglish
questions against a few FAQ lines. It decides the embeddings provider for `kb_chunks.embedding vector(1024)`.

This folder is not part of the product build: it has no `package.json`, adds no dependencies and
is not imported by `src/`.

## Run it (from the repo root)
1. Node 22.18 or newer runs TypeScript directly. On Node 22.12 to 22.17 add `--experimental-strip-types`.
2. Copy `example.env` to `.env.local` in this folder and paste your keys. Never commit `.env.local`.
3. Run:
   - `node scripts/embeddings-eval/compare-embeddings.mts` (every provider that has a key)
   - `node scripts/embeddings-eval/compare-embeddings.mts --only cohere` (one provider)
   - `node scripts/embeddings-eval/anthropic-check.mjs` (tests the Anthropic key and prints its rate limits)
4. `results.json` is written here. It contains no keys. Do not commit it; put the summary in `docs/` instead.

## Read the result
- `OK` = expected FAQ line ranked first, `TOP3` = in the top three, `MISS` = not in the top three.
- The database column is `vector(1024)`, so the model must report 1024 dimensions.
- Compare Tanglish and Tamil most. English will usually be fine for every model.

## Important
- The FAQ lines and queries in `data.json` are placeholders. Replace them with Raja's real FAQ lines and
  real customer chats, then re-run before locking the model.
- Voyage keys may now be issued through MongoDB Atlas. If so, set `VOYAGE_BASE_URL` in `.env.local` to the
  endpoint shown in the Atlas model-API-key page.
