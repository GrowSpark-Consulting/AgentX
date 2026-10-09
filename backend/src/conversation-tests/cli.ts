import { createAnthropicClient } from "../agent/llm/anthropic";
import { noopTracer } from "../agent/llm/tracing";
import { loadChats } from "./load";
import { runChat } from "./run-chat";

// pnpm test:conversations [--live] [--only <text in the file name or chat name>]
//
// Mock mode (the default) is what CI runs. --live asks the REAL models (extraction and reply); the knowledge base and the
// sender stay fakes, so nothing is ever sent. It costs a model call or two per turn and is never run in CI: it needs
// ANTHROPIC_API_KEY in the environment. The report prints each chat's turns with what the model understood.

const args = process.argv.slice(2);
const live = args.includes("--live");
const onlyIndex = args.indexOf("--only");
const only = onlyIndex >= 0 ? args[onlyIndex + 1]?.toLowerCase() : undefined;
if (onlyIndex >= 0 && !only) {
  console.error("--only needs a text to look for in the chat file or name.");
  process.exit(2);
}

async function main(): Promise<number> {
  let chats = loadChats();
  if (only) chats = chats.filter((c) => c.file.toLowerCase().includes(only) || c.chat.name.toLowerCase().includes(only));
  if (chats.length === 0) {
    console.error("No chat matches.");
    return 2;
  }
  let llm;
  if (live) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      console.error("--live needs ANTHROPIC_API_KEY in the environment.");
      return 2;
    }
    llm = createAnthropicClient(key, noopTracer);
  }
  console.log(`${live ? "LIVE (real models)" : "mock models"}: ${chats.length} chat(s)\n`);

  let failed = 0;
  for (const { file, chat } of chats) {
    const report = await runChat(chat, { mode: live ? "live" : "mock", llm });
    const flag = chat.needsNativeCheck ? "  [needs native-speaker check]" : "";
    console.log(`${report.failures.length === 0 ? "PASS" : "FAIL"}  ${file}  ${chat.name}${flag}`);
    if (live || report.failures.length > 0) {
      for (const t of report.transcript) {
        console.log(`      customer: ${t.customer}`);
        console.log(`      -> intent ${t.intent ?? "-"} (${t.confidence ?? "-"}), case ${t.planCase}${t.handoff ? `, handoff ${t.handoff}` : ""}${t.optedOut ? ", OPTED OUT" : ""}${t.reply ? `\n      -> reply: ${t.reply}` : ""}`);
      }
    }
    for (const f of report.failures) console.log(`      x ${f}`);
    if (report.failures.length > 0) failed++;
  }
  console.log(`\n${chats.length - failed} passed, ${failed} failed`);
  return failed === 0 ? 0 : 1;
}

main().then((code) => process.exit(code), (error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
});
