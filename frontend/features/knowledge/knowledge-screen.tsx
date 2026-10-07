"use client";

import type { Role } from "@pakka/types";
import { useCallback, useEffect, useState } from "react";
import { formatError } from "@/lib/errors";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { ConfirmDialog } from "./confirm-dialog";
import { Documents } from "./documents";
import { FaqFormDialog } from "./faq-form-dialog";
import { FaqList } from "./faq-list";
import { FlashStatus, useFlash } from "./flash";
import { GapsList } from "./gaps-list";
import {
  answerGap,
  canAnswerGaps,
  canWriteKnowledge,
  createFaq,
  deleteFaq,
  describeKbWriteError,
  dismissGap,
  faqChanges,
  listFaqs,
  listGaps,
  updateFaq,
  upsertFaq,
  type FaqInput,
  type FaqItem,
  type GapItem,
  type SectionSource,
} from "./kb-content";
import { ServicesEditor } from "./services-editor";

// The real Knowledge base page: the /dashboard/preview screen's header and sections, in the
// prototype's order (features/knowledge/pakka-knowledge.tsx: 42px title, 36px between sections, 960px
// of content). Services and documents are owned by their sections; FAQs and unanswered questions live
// here because answering a question adds an FAQ. FAQs are an RLS read; questions come from
// GET /api/kb/gaps; every write goes through the API (kb-content.ts) and changes the list only after
// it answers. Owners and admins write; every member, staff too, can answer a question.
// Website sync (POST /api/onboarding/import-site, Dev 1) is not built and has no button here.

/** A section's state; Try again is attached when rendering. */
type Loaded<T> = Exclude<SectionSource<T>, { status: "error" }> | { status: "error"; message: string };
type FaqDialog = { kind: "none" } | { kind: "form"; faq: FaqItem | null } | { kind: "delete"; faq: FaqItem } | { kind: "dismiss"; gap: GapItem };

export function KnowledgeScreen({ tenantId, timeZone, role }: { tenantId: string; timeZone: string; role: Role }) {
  const canWrite = canWriteKnowledge(role);
  const [faqs, setFaqs] = useState<Loaded<FaqItem>>({ status: "loading" });
  const [gaps, setGaps] = useState<Loaded<GapItem>>({ status: "loading" });
  const [dialog, setDialog] = useState<FaqDialog>({ kind: "none" });
  const [toast, flash] = useFlash();

  const loadFaqs = useCallback(
    () =>
      listFaqs(getSupabaseBrowserClient(), tenantId).then(
        (items) => setFaqs({ status: "ready", items }),
        (err: unknown) => setFaqs({ status: "error", message: formatError(err).message }),
      ),
    [tenantId],
  );

  const loadGaps = useCallback(
    (signal?: AbortSignal) =>
      listGaps(tenantId, signal).then(
        (items) => setGaps({ status: "ready", items }),
        (err: unknown) => {
          if (!signal?.aborted) setGaps({ status: "error", message: formatError(err).message });
        },
      ),
    [tenantId],
  );

  useEffect(() => {
    const abort = new AbortController();
    void loadFaqs();
    void loadGaps(abort.signal);
    return () => abort.abort();
  }, [loadFaqs, loadGaps]);

  const faqItems = faqs.status === "ready" ? faqs.items : [];
  const retryFaqs = () => {
    setFaqs({ status: "loading" });
    void loadFaqs();
  };
  const retryGaps = () => {
    setGaps({ status: "loading" });
    void loadGaps();
  };
  const faqSource: SectionSource<FaqItem> = faqs.status === "error" ? { ...faqs, retry: retryFaqs } : faqs;
  const gapSource: SectionSource<GapItem> = gaps.status === "error" ? { ...gaps, retry: retryGaps } : gaps;
  const close = useCallback(() => setDialog({ kind: "none" }), []);
  const addToFaqs = (faq: FaqItem) => setFaqs((prev) => (prev.status === "ready" ? { ...prev, items: upsertFaq(prev.items, faq) } : prev));
  const dropGap = (id: string) => setGaps((prev) => (prev.status === "ready" ? { ...prev, items: prev.items.filter((g) => g.id !== id) } : prev));

  async function saveFaq(editing: FaqItem | null, input: FaqInput) {
    if (editing) {
      const changes = faqChanges(editing, input);
      if (Object.keys(changes).length === 0) return setDialog({ kind: "none" });
      addToFaqs(await updateFaq(tenantId, editing.id, changes).catch(refreshAfterFailedSave));
      setDialog({ kind: "none" });
      flash("Saved the FAQ");
    } else {
      addToFaqs(await createFaq(tenantId, input).catch(refreshAfterFailedSave));
      setDialog({ kind: "none" });
      flash("Added to FAQs");
    }
  }

  /** upstream_failed on a save leaves the row stored as failed (contracts.md section 9): show it. */
  function refreshAfterFailedSave(err: unknown): never {
    if (formatError(err).code === "upstream_failed") void loadFaqs();
    throw err;
  }

  async function removeFaq(faq: FaqItem) {
    await deleteFaq(tenantId, faq.id);
    setFaqs((prev) => (prev.status === "ready" ? { ...prev, items: prev.items.filter((f) => f.id !== faq.id) } : prev));
    setDialog({ kind: "none" });
    flash("Deleted the FAQ");
  }

  async function answer(gap: GapItem, a: string) {
    const faq = await answerGap(tenantId, gap.id, a);
    addToFaqs(faq);
    dropGap(gap.id);
    flash("Added to FAQs");
  }

  async function dismiss(gap: GapItem) {
    await dismissGap(tenantId, gap.id);
    dropGap(gap.id);
    setDialog({ kind: "none" });
    flash("Dismissed the question");
  }

  return (
    // 960px: the prototype's 1040px included its own 40px side padding, which .app-main gives here.
    <div style={{ display: "flex", flexDirection: "column", gap: "36px", maxWidth: "960px", minWidth: 0, color: "var(--color-text)" }}>
      <div>
        <h1 className="app-h1">Knowledge base</h1>
        <p style={{ margin: "4px 0 0", color: "var(--color-neutral-700)" }}>What customers can book, how long it takes and what it costs.</p>
      </div>
      <GapsList source={gapSource} canAnswer={canAnswerGaps(role)} canDismiss={canWrite} onAnswer={answer} onDismiss={(gap) => setDialog({ kind: "dismiss", gap })} />
      <ServicesEditor tenantId={tenantId} />
      <FaqList
        source={faqSource}
        canWrite={canWrite}
        onAdd={() => setDialog({ kind: "form", faq: null })}
        onEdit={(faq) => setDialog({ kind: "form", faq })}
        onDelete={(faq) => setDialog({ kind: "delete", faq })}
      />
      <Documents tenantId={tenantId} timeZone={timeZone} canWrite={canWrite} />

      {dialog.kind === "form" ? <FaqFormDialog faq={dialog.faq} existing={faqItems} onSave={(input) => saveFaq(dialog.faq, input)} onClose={close} /> : null}
      {dialog.kind === "delete" ? (
        <ConfirmDialog
          title="Delete this FAQ?"
          text={`“${dialog.faq.q}” The AI stops using this answer. This can’t be undone.`}
          confirmLabel="Delete FAQ"
          busyLabel="Deleting…"
          keepLabel="Keep it"
          onConfirm={() => removeFaq(dialog.faq)}
          describeError={(err) => describeKbWriteError(err, "Couldn't delete the FAQ", "FAQ")}
          onClose={close}
        />
      ) : null}
      {dialog.kind === "dismiss" ? (
        <ConfirmDialog
          title="Dismiss this question?"
          text={`“${dialog.gap.question}” It leaves this list without an answer being added.`}
          confirmLabel="Dismiss question"
          busyLabel="Dismissing…"
          keepLabel="Keep it"
          onConfirm={() => dismiss(dialog.gap)}
          describeError={(err) => describeKbWriteError(err, "Couldn't dismiss the question", "question")}
          onClose={close}
        />
      ) : null}
      <FlashStatus toast={toast} />
    </div>
  );
}
