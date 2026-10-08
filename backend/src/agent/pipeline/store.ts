import type { SupabaseClient } from "@supabase/supabase-js";
import { NonRetriableError } from "inngest";
import { z } from "zod";
import { AppError } from "../../lib/errors";
import { supabaseAdmin } from "../../lib/supabase-admin";
import { TimeoutError, withTimeout } from "../../lib/timeout";
import { ANSWERED_ACTION } from "./events";

// The message pipeline's reads and writes, with the service role. It bypasses row-level security, so every
// query names its business (`tenant_id`; for the tenants table, its own `id`), and the business always comes
// from the event of a verified inbound message, re-checked against the message row: a message is only found
// if it belongs to that business and that conversation.
//
// What is read is what a step may remember. Inngest keeps every step's result, so only the columns the pipeline
// uses are selected, and nothing here returns a message's text, a phone number or a name: the pipeline re-reads
// what it needs, when it needs it.
//
// Failures are fixed words: the log has the Postgres code (or "timed out") and nothing else. Every call has a
// deadline and is aborted when it passes. A failure that waiting can fix (the database unreachable, a timeout) is
// an ordinary error, which Inngest retries; one that it cannot (a refused statement, a row that is not the
// shape expected) is non-retriable, so a bug is not repeated three times.

export interface InboundMessage {
  id: string;
  direction: "in" | "out";
  sender: "customer" | "ai" | "staff" | "system";
  kind: string | null;
  createdAt: string;
}
export interface ConversationRow {
  id: string;
  contactId: string;
  mode: "ai" | "human" | "external";
}
export interface ContactRow {
  id: string;
  language: string | null;
  optedOut: boolean;
}
export interface TenantRow {
  id: string;
  vertical: string;
  verticalVersion: number;
}
export interface LeadRow {
  id: string;
  stage: string;
  created: boolean;
}
/** A customer message that has not been answered: its id and kind, never its text. */
export interface PendingMessage {
  id: string;
  kind: string | null;
}

export interface PipelineStore {
  /** The message, only if it is this business's and this conversation's. */
  getMessage(tenantId: string, conversationId: string, messageId: string): Promise<InboundMessage | null>;
  getConversation(tenantId: string, conversationId: string): Promise<ConversationRow | null>;
  getContact(tenantId: string, contactId: string): Promise<ContactRow | null>;
  getTenant(tenantId: string): Promise<TenantRow | null>;
  /** Whether the reply step has recorded (an audit row) that this message was answered. `since`: the message's own time. */
  isAnswered(tenantId: string, messageId: string, since: string): Promise<boolean>;
  /**
   * The contact's open lead (any stage but won and lost; the oldest if there are several), or a new one. One open
   * lead per contact: a business has one pack, so one need. The database does not enforce it (no unique index; see
   * the task notes): it holds because the job runs one conversation at a time and a contact has one open
   * conversation per channel. Two conversations of one contact running at once (an old one closed and a new one
   * opened) could make two. `created` is therefore a hint, not a count: a retried run that finds the lead its first
   * attempt made reports false.
   */
  findOrCreateOpenLead(tenantId: string, contactId: string): Promise<LeadRow>;
  /**
   * The customer's most recent messages in this conversation since `since` (the newest 10, oldest first) that have
   * not been answered.
   */
  recentUnanswered(tenantId: string, conversationId: string, since: string): Promise<PendingMessage[]>;
}

export const PIPELINE_DB_TIMEOUT_MS = 10_000;
const BATCH_LIMIT = 10;
/**
 * An audit row says a message was answered; its time is our clock, a message's `created_at` is Meta's. A day of
 * slack on the lower bound keeps a Meta clock that runs ahead from hiding the row, and keeps the lookup on the
 * index (tenant_id, created_at) instead of reading the business's whole audit log.
 */
const AUDIT_SLACK_MS = 24 * 60 * 60 * 1000;

const Iso = z.string().transform((value) => new Date(value).toISOString());
const MessageRow = z.object({
  id: z.string(),
  direction: z.enum(["in", "out"]),
  sender: z.enum(["customer", "ai", "staff", "system"]),
  kind: z.string().nullable(),
  created_at: Iso,
});
const ConversationSchema = z.object({ id: z.string(), contact_id: z.string(), mode: z.enum(["ai", "human", "external"]) });
const ContactSchema = z.object({ id: z.string(), language: z.string().nullable(), opted_out_at: z.string().nullable() });
const TenantSchema = z.object({ id: z.string(), vertical: z.string(), vertical_version: z.number().int() });
const LeadSchema = z.object({ id: z.string(), stage: z.string() });
const PendingSchema = z.object({ id: z.string(), kind: z.string().nullable() });

// Postgres codes that mean the database was unreachable, restarting or overloaded: waiting can fix them.
const TRANSIENT_CODE = /^(08.{3}|53[23]00|57P0[123]|57014|40001|40P01|PGRST00[0-3])$/;
const isTransient = (code: string | undefined) => code === undefined || code === "" || TRANSIENT_CODE.test(code);

type Result = { data: unknown; error: { code?: string; message?: string } | null };

export function createPipelineStore(db: SupabaseClient = supabaseAdmin(), { timeoutMs = PIPELINE_DB_TIMEOUT_MS }: { timeoutMs?: number } = {}): PipelineStore {
  const WORDS = "We couldn't read the conversation just now. Try again in a moment.";

  async function run(op: string, query: (signal: AbortSignal) => PromiseLike<Result>): Promise<Result> {
    try {
      return await withTimeout(query, timeoutMs);
    } catch (error) {
      console.error(`[pipeline] ${op} ${error instanceof TimeoutError ? "timed out" : "threw"}`);
      throw new AppError("upstream_failed", WORDS);
    }
  }
  const fail = (op: string, error: { code?: string }): never => {
    console.error(`[pipeline] ${op} failed: code ${typeof error.code === "string" ? error.code.slice(0, 16) : "none"}`);
    if (isTransient(error.code)) throw new AppError("upstream_failed", WORDS);
    throw new NonRetriableError(WORDS);
  };
  /** A row that is not the shape expected will not change by waiting: not retried, and nothing of it is quoted. */
  function parse<T>(schema: z.ZodType<T>, data: unknown, op: string): T {
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      console.error(`[pipeline] ${op} returned an unexpected row`);
      throw new NonRetriableError(WORDS);
    }
    return parsed.data;
  }
  const auditFloor = (since: string) => new Date(Date.parse(since) - AUDIT_SLACK_MS).toISOString();

  return {
    async getMessage(tenantId, conversationId, messageId) {
      const { data, error } = await run("read message", (signal) =>
        db.from("messages").select("id, direction, sender, kind, created_at").eq("id", messageId).eq("tenant_id", tenantId).eq("conversation_id", conversationId).abortSignal(signal).maybeSingle(),
      );
      if (error) fail("read message", error);
      if (data === null) return null;
      const row = parse(MessageRow, data, "read message");
      return { id: row.id, direction: row.direction, sender: row.sender, kind: row.kind, createdAt: row.created_at };
    },

    async getConversation(tenantId, conversationId) {
      const { data, error } = await run("read conversation", (signal) =>
        db.from("conversations").select("id, contact_id, mode").eq("id", conversationId).eq("tenant_id", tenantId).abortSignal(signal).maybeSingle(),
      );
      if (error) fail("read conversation", error);
      if (data === null) return null;
      const row = parse(ConversationSchema, data, "read conversation");
      return { id: row.id, contactId: row.contact_id, mode: row.mode };
    },

    async getContact(tenantId, contactId) {
      const { data, error } = await run("read contact", (signal) =>
        db.from("contacts").select("id, language, opted_out_at").eq("id", contactId).eq("tenant_id", tenantId).abortSignal(signal).maybeSingle(),
      );
      if (error) fail("read contact", error);
      if (data === null) return null;
      const row = parse(ContactSchema, data, "read contact");
      return { id: row.id, language: row.language, optedOut: row.opted_out_at !== null };
    },

    async getTenant(tenantId) {
      const { data, error } = await run("read business", (signal) =>
        db.from("tenants").select("id, vertical, vertical_version").eq("id", tenantId).abortSignal(signal).maybeSingle(),
      );
      if (error) fail("read business", error);
      if (data === null) return null;
      const row = parse(TenantSchema, data, "read business");
      return { id: row.id, vertical: row.vertical, verticalVersion: row.vertical_version };
    },

    async isAnswered(tenantId, messageId, since) {
      const { data, error } = await run("check answered", (signal) =>
        db.from("audit_logs").select("id").eq("tenant_id", tenantId).eq("action", ANSWERED_ACTION).eq("entity_id", messageId).gte("created_at", auditFloor(since)).limit(1).abortSignal(signal),
      );
      if (error) fail("check answered", error);
      return Array.isArray(data) && data.length > 0;
    },

    async findOrCreateOpenLead(tenantId, contactId) {
      const found = await run("read lead", (signal) =>
        db.from("leads").select("id, stage").eq("tenant_id", tenantId).eq("contact_id", contactId).not("stage", "in", "(won,lost)").order("created_at", { ascending: true }).limit(1).abortSignal(signal),
      );
      if (found.error) fail("read lead", found.error);
      if (Array.isArray(found.data) && found.data.length > 0) {
        const row = parse(LeadSchema, found.data[0], "read lead");
        return { id: row.id, stage: row.stage, created: false };
      }
      const made = await run("create lead", (signal) =>
        db.from("leads").insert({ tenant_id: tenantId, contact_id: contactId }).select("id, stage").abortSignal(signal).single(),
      );
      if (made.error) fail("create lead", made.error);
      const row = parse(LeadSchema, made.data, "create lead");
      return { id: row.id, stage: row.stage, created: true };
    },

    async recentUnanswered(tenantId, conversationId, since) {
      // The NEWEST ten, then put back in order: if there are more than ten, the latest are the ones to answer.
      const read = await run("read recent messages", (signal) =>
        db
          .from("messages")
          .select("id, kind")
          .eq("tenant_id", tenantId)
          .eq("conversation_id", conversationId)
          .eq("direction", "in")
          .eq("sender", "customer")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(BATCH_LIMIT)
          .abortSignal(signal),
      );
      if (read.error) fail("read recent messages", read.error);
      const pending = parse(z.array(PendingSchema), read.data ?? [], "read recent messages").reverse();
      if (pending.length === 0) return [];
      const answered = await run("check answered", (signal) =>
        db
          .from("audit_logs")
          .select("entity_id")
          .eq("tenant_id", tenantId)
          .eq("action", ANSWERED_ACTION)
          .in("entity_id", pending.map((m) => m.id))
          .gte("created_at", auditFloor(since))
          .abortSignal(signal),
      );
      if (answered.error) fail("check answered", answered.error);
      const done = new Set(parse(z.array(z.object({ entity_id: z.string() })), answered.data ?? [], "check answered").map((row) => row.entity_id));
      return pending.filter((m) => !done.has(m.id));
    },
  };
}
