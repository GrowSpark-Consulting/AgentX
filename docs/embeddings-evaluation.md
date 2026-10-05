# Embeddings evaluation (Day 0)

**Date:** 2026-10-05 **Owner:** Dev 1 (Agent) **Status:** provisional, one of two candidates tested

## Why
The knowledge base stores chunk vectors in `kb_chunks.embedding vector(1024)`. The embeddings model must
return 1024 dimensions and handle English, Tamil and Tanglish questions.

## What was tested
- Script: `scripts/embeddings-eval/compare-embeddings.mts`
- Data: 10 placeholder real-estate FAQ lines and 15 questions (3 English, 8 Tanglish, 4 Tamil script) in
  `scripts/embeddings-eval/data.json`. The facts are invented for testing.
- Method: embed the FAQ lines as documents and each question as a query, then rank FAQ lines by cosine
  similarity and check whether the expected line comes first.

## Results

| Model | Dimensions | Top-1 | Top-3 | English | Tanglish | Tamil |
| --- | --- | --- | --- | --- | --- | --- |
| Cohere `embed-multilingual-v3.0` (`search_document` / `search_query`) | 1024 | 14/15 | 15/15 | 3/3 | 7/8 | 4/4 |
| Voyage `voyage-4` | 1024 (default) | not run yet | not run yet | | | |

The one miss was the Tanglish question "Possession eppo kodupeenga?". The expected line (possession date)
ranked second behind the amenities line.

## Reading the result
- Cohere meets the schema (1024 dimensions) and found the right line in the top three every time.
- This is a small, easy test: 10 FAQ lines, placeholder content, no distractors that look alike. A real
  knowledge base has far more chunks, so expect lower scores. It is a first signal, not proof.
- Voyage has not been tested yet. Voyage keys now appear to be issued through MongoDB Atlas, and we are
  waiting on Raja to confirm whether the existing GrowSpark Atlas organisation should be used.
- The Cohere key used here is a trial key. Trial keys are for testing; confirm Cohere's terms and get a
  production key before launch.

## Decision (provisional)
Use **Cohere `embed-multilingual-v3.0` at 1024 dimensions** for now. `vector(1024)` in the schema does not change.
Revisit when both of these are done:
1. Voyage `voyage-4` is tested on the same data.
2. The test is re-run with Raja's real FAQ lines and real Tamil and Tanglish chats.

## Next steps
- [ ] Raja: answer the Atlas / Voyage account question.
- [ ] Raja: send real FAQ lines and real customer chats.
- [ ] Re-run with real data, and test the English-normalised question that extraction will produce.
- [ ] Confirm the final model at the Day 2 retrieval test and record it here.
