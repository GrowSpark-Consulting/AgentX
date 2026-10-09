import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { parse } from "yaml";
import { Chat } from "./schema";

// tests/conversations/<pack>/*.yaml, in file-name order. A file that is not a valid chat is an error that names the
// file: a typo in a test must not make it quietly pass.

export const CONVERSATIONS_DIR = fileURLToPath(new URL("../../../tests/conversations", import.meta.url));

export interface LoadedChat {
  file: string;
  chat: Chat;
}

export function loadChats(dir = CONVERSATIONS_DIR): LoadedChat[] {
  const loaded: LoadedChat[] = [];
  for (const pack of readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()) {
    for (const file of readdirSync(join(dir, pack)).filter((f) => f.endsWith(".yaml")).sort()) {
      const path = `${pack}/${file}`;
      const parsed = Chat.safeParse(parse(readFileSync(join(dir, pack, file), "utf8")));
      if (!parsed.success) throw new Error(`${path} is not a valid chat: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
      if (parsed.data.pack !== pack) throw new Error(`${path}: the chat says pack "${parsed.data.pack}" but it is in the folder "${pack}"`);
      loaded.push({ file: path, chat: parsed.data });
    }
  }
  return loaded;
}
