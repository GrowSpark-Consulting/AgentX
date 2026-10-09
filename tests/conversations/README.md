# Scripted conversations

One YAML file per chat, in a folder per pack (`tests/conversations/<pack>/NN-name.yaml`). A chat is a business setup and a
list of customer turns; each turn can say what the **mocked** models answer and what must be true afterwards.

```
pnpm test:conversations                          # mock models: what CI runs (also part of `pnpm test`)
pnpm test:conversations -- --only handoff        # only chats whose file or name contains "handoff"
pnpm test:conversations -- --live                # the REAL models (needs ANTHROPIC_API_KEY); never in CI
```

The runner drives the real pipeline steps (`stopCheck`, `understandTurn`, `replyTurn`) on an in-memory store. The knowledge
base returns the chat's own `kb` chunks, and the sender is a fake (nothing is ever sent), in both modes.

- **Mock mode** checks the code around the models: what is kept from the extraction, the plan row, the post-check (no price that
  is not in the knowledge-base text, the safe fallback), the privacy notice, STOP, the opt-out by the model, the handovers.
  It cannot say whether the real model understands a message.
- **`--live`** checks only `expect` (not `mockOnly`) and prints what the real model understood for every turn: intent,
  confidence, the plan row and the reply. This is how Raja's phrase list is checked against the real classifier.
  It costs one or two model calls per turn: run it on purpose, with `--only`.

## A chat

```yaml
name: English price question is answered from the knowledge base only
settings: {}                 # tenants.agent_settings, e.g. { privacyNotice: true }
contact: { alreadySawNotice: true }
kb: ["2BHK of 950 sq ft in Velachery starts at ₹78 lakh."]
turns:
  - customer: "What is the price of a 2BHK in Velachery?"
    mock:                    # what the models say in mock mode
      extraction: { intent: question, fields: { location: Velachery }, question: "..." }
      reply: "A 2BHK in Velachery starts at ₹78 lakh."   # a list = one text per attempt
    expect:                  # both modes
      extracted: { intent: question }
      noInventedPrice: true
      aiReplies: 1
    mockOnly:                # mock mode only
      case: answered_from_kb
```

What can be asserted: `stop`, `extracted` (intent, language, sentiment, asksIfHuman, notInterested, fields), `case`,
`reply` (sent, fixed line and language, buttons, contains, notContains, notice), `noInventedPrice`, `optedOut`, `consent` (the new
consent_logs of the turn), `handoff` (trigger and priority, or null), `mode`, `leadStage`, `leadFields`, `aiReplies`,
`confirmations`. Every turn also checks, always: at most one AI reply, sent as an `ai_reply` through notify.send, and nothing
sent to a contact who opted out.

Not covered here: the gate's other outcomes (a chat a person has, the AI switched off, a contact who opted out earlier) are tested
in `gate.test.ts`; the runner starts every chat with the AI in charge. A turn can be a tap on a reply button (`tap: "exit:talk"`, with the button title as the text). A turn must assert something (`expect` or `mockOnly`).
A STOP chat's later turns show the gate's opted-out outcome.

## The files

- `01`-`11`: the first chats: price questions (English, Tanglish), off-topic, "are you a bot?", prompt injection, STOP, no
  privacy notice by default, the notice switched on, and stray characters ("x", "?", "ok", an emoji) that must not start the exit question, and the exit question as two buttons (Talk to the team, Continue).
- `20`-`45`: Raja's phrase list (`docs/reference/opt-out-handoff-phrases.md`), one opt-out and one handover per language.
  The six languages Raja marked (Telugu, Kannada, Bengali, Marathi, Gujarati, Punjabi) have `needsNativeCheck: true`: a
  native speaker must read them before they are final test data.
