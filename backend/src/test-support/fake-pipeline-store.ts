import type { ContactRow, ConversationRow, InboundMessage, LeadRow, PendingMessage, PipelineStore, TenantRow } from "../agent/pipeline/store";

// An in-memory PipelineStore for tests. It enforces the same filtering the real store does: a message,
// conversation or contact is only found for the business that owns it, an "answered" row only counts if it is
// no older than a day before the message, and a batch is the newest ten. Its rows also carry fields the
// pipeline must never keep (a message body, a phone number, a name), as the database's own rows do, so a
// pipeline that passed a row through to a step result would leak them in a test.

export const HIDDEN = { body: "HIDDEN-MESSAGE-TEXT", phone: "+919800000001", name: "Hidden Name" };
const DAY_MS = 24 * 60 * 60 * 1000;

export interface FakeMessage extends InboundMessage {
  tenantId: string;
  conversationId: string;
}
export interface FakeContact extends ContactRow {
  tenantId: string;
}
export interface FakeConversation extends ConversationRow {
  tenantId: string;
}
export interface FakeLead {
  id: string;
  tenantId: string;
  contactId: string;
  stage: string;
  createdAt: number;
}

export function fakePipelineStore(
  seed: {
    tenants?: TenantRow[];
    messages?: FakeMessage[];
    conversations?: FakeConversation[];
    contacts?: FakeContact[];
    leads?: FakeLead[];
    /** Message ids that have an "answered" audit row, written 10 seconds after the message unless `answeredAt` says otherwise. */
    answered?: string[];
    answeredAt?: Record<string, string>;
  } = {},
) {
  const tenants = new Map((seed.tenants ?? []).map((t) => [t.id, t]));
  const messages = new Map((seed.messages ?? []).map((m) => [m.id, m]));
  const conversations = new Map((seed.conversations ?? []).map((c) => [c.id, c]));
  const contacts = new Map((seed.contacts ?? []).map((c) => [c.id, c]));
  const leads = new Map((seed.leads ?? []).map((l) => [l.id, l]));
  const answered = new Map<string, number>();
  for (const id of seed.answered ?? []) {
    const at = seed.answeredAt?.[id] ?? (messages.has(id) ? new Date(Date.parse(messages.get(id)!.createdAt) + 10_000).toISOString() : new Date().toISOString());
    answered.set(id, Date.parse(at));
  }
  const calls: string[] = [];
  const state = { failNext: new Set<keyof PipelineStore>(), leadCounter: 0 };
  const maybeFail = (op: keyof PipelineStore) => {
    if (state.failNext.delete(op)) throw new Error(`${op} failed (simulated)`);
  };
  const isAnsweredAt = (id: string, since: string) => {
    const at = answered.get(id);
    return at !== undefined && at >= Date.parse(since) - DAY_MS;
  };

  const store: PipelineStore = {
    async getMessage(tenantId, conversationId, messageId) {
      calls.push("getMessage");
      maybeFail("getMessage");
      const m = messages.get(messageId);
      return m && m.tenantId === tenantId && m.conversationId === conversationId ? ({ id: m.id, direction: m.direction, sender: m.sender, kind: m.kind, createdAt: m.createdAt, ...HIDDEN } as InboundMessage) : null;
    },
    async getConversation(tenantId, conversationId) {
      calls.push("getConversation");
      maybeFail("getConversation");
      const c = conversations.get(conversationId);
      return c && c.tenantId === tenantId ? ({ id: c.id, contactId: c.contactId, mode: c.mode, ...HIDDEN } as ConversationRow) : null;
    },
    async getContact(tenantId, contactId) {
      calls.push("getContact");
      maybeFail("getContact");
      const c = contacts.get(contactId);
      return c && c.tenantId === tenantId ? ({ id: c.id, language: c.language, optedOut: c.optedOut, ...HIDDEN } as ContactRow) : null;
    },
    async getTenant(tenantId) {
      calls.push("getTenant");
      maybeFail("getTenant");
      const t = tenants.get(tenantId);
      return t ? ({ ...t, ...HIDDEN, name: "Hidden Business Name" } as TenantRow) : null;
    },
    async isAnswered(tenantId, messageId, since) {
      calls.push("isAnswered");
      maybeFail("isAnswered");
      return messages.get(messageId)?.tenantId === tenantId && isAnsweredAt(messageId, since);
    },
    async findOrCreateOpenLead(tenantId, contactId): Promise<LeadRow> {
      calls.push("findOrCreateOpenLead");
      maybeFail("findOrCreateOpenLead");
      const open = [...leads.values()]
        .filter((l) => l.tenantId === tenantId && l.contactId === contactId && l.stage !== "won" && l.stage !== "lost")
        .sort((a, b) => a.createdAt - b.createdAt)[0];
      if (open) return { id: open.id, stage: open.stage, created: false };
      const lead: FakeLead = { id: `10000000-0000-0000-0000-${String(++state.leadCounter).padStart(12, "0")}`, tenantId, contactId, stage: "new", createdAt: Date.now() + state.leadCounter };
      leads.set(lead.id, lead);
      return { id: lead.id, stage: lead.stage, created: true };
    },
    async recentUnanswered(tenantId, conversationId, since): Promise<PendingMessage[]> {
      calls.push("recentUnanswered");
      maybeFail("recentUnanswered");
      return [...messages.values()]
        .filter((m) => m.tenantId === tenantId && m.conversationId === conversationId && m.direction === "in" && m.sender === "customer" && Date.parse(m.createdAt) >= Date.parse(since))
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)) // newest first
        .slice(0, 10)
        .reverse()
        .filter((m) => !isAnsweredAt(m.id, since))
        .map((m) => ({ id: m.id, kind: m.kind, ...HIDDEN }) as PendingMessage);
    },
  };

  return { store, tenants, messages, conversations, contacts, leads, answered, calls, state };
}
