import { z } from "zod";

/** Sent when an upload has been stored and its text is waiting to be chunked and embedded. */
export const KB_UPLOAD_EVENT = "kb/document.uploaded";

/** Ids only (docs/contracts.md, section 5): never text, names or numbers. */
export const KbUploadedData = z.object({ tenantId: z.guid(), documentId: z.guid() });
export type KbUploadedData = z.infer<typeof KbUploadedData>;

/** The fixed event id: Inngest drops a second event with the same id, so one upload starts one job. */
export const kbUploadEventId = (documentId: string) => `kb_document_uploaded:${documentId}`;
