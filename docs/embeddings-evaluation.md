# Embeddings evaluation (Day 0)

**Date:** 2026-10-05 **Owner:** Dev 1 (Agent) **Status:** provisional, both candidates tested on placeholder data

## Why
The knowledge base stores chunk vectors in `kb_chunks.embedding vector(1024)`. The embeddings model must
return 1024 dimensions and handle English, Tamil and Tanglish questions.

## What was tested
- Script: `scripts/embeddings-eval/compare-embeddings.mts`
- Data: 10 placeholder real-estate FAQ lines and 15 questions (3 English, 8 Tanglish, 4 Tamil script) in
  `scripts/embeddings-eval/data.json`. The facts are invented for testing.
- Method: embed the FAQ lines as documents and each question as a query, then rank FAQ lines by cosine
  similarity and check whether the expected line comes first.
- Both models were run in the same invocation on the same data.

## Results

| Model | Dimensions | Top-1 | Top-3 | English | Tanglish | Tamil |
| --- | --- | --- | --- | --- | --- | --- |
| Cohere `embed-multilingual-v3.0` (`search_document` / `search_query`) | 1024 | 14/15 | 15/15 | 3/3 | 7/8 | 4/4 |
| Voyage `voyage-4` (`document` / `query`, `output_dimension` 1024, via the MongoDB Atlas endpoint `https://ai.mongodb.com/v1`) | 1024 | 15/15 | 15/15 | 3/3 | 8/8 | 4/4 |

The only difference was the Tanglish question "Possession eppo kodupeenga?" (#9). Cohere ranked the expected
line (possession date) second, behind the amenities line. Voyage ranked it first.

## Reading the result
- Both models meet the schema (1024 dimensions) and found the right line in the top three every time.
- Voyage was ahead by one query out of 15. That is too small a gap to call a winner.
- This is a small, easy test: 10 FAQ lines, placeholder content, no distractors that look alike. A real
  knowledge base has far more chunks, so expect lower scores. It is a first signal, not proof.
- The Voyage key is a MongoDB Atlas model API key, used against `https://ai.mongodb.com/v1`. The Atlas page
  shows only the host; the `/v1/embeddings` path worked. The earlier "200M free tokens" figure applied to
  Voyage's own accounts and is not confirmed for Atlas.
- The Cohere key used here is a trial key. Trial keys are for testing; confirm Cohere's terms and get a
  production key before launch.

## Decision (provisional)
Not locked. On this placeholder data Voyage `voyage-4` is slightly ahead (15/15 vs 14/15 top-1, Tanglish 8/8
vs 7/8), so it is the provisional lead, with Cohere `embed-multilingual-v3.0` as the backup. Both are 1024
dimensions, so `vector(1024)` in the schema does not change either way.

Lock the choice only when all of these are done:
1. The test is re-run with Raja's real FAQ lines and real Tamil and Tanglish chats.
2. The Atlas endpoint and pricing are verified (see open items).
3. Retrieval is confirmed at the Day 2 test.

## Open items
- **Atlas endpoint and pricing (unverified):** confirm the supported base URL and model names, the price per
  million tokens, free allowance and rate limits for Atlas model API keys, and which Atlas organisation and
  project owns the key. Do not assume Voyage's own pricing applies.
- **Cohere terms:** the key used is a trial key; confirm terms and get a production key if Cohere is chosen.
- **Config:** if Voyage is chosen, the app needs the Atlas base URL as configuration (the eval script uses
  `VOYAGE_BASE_URL`). `EMBEDDINGS_API_KEY` is the only embeddings variable in the env schema today.

## Next steps
- [ ] Raja: confirm the Atlas organisation and project that own the Voyage key, and its pricing.
- [ ] Raja: send real FAQ lines and real customer chats.
- [ ] Re-run both models with real data, and test the English-normalised question that extraction will produce.
- [ ] Confirm the final model at the Day 2 retrieval test and record it here.
