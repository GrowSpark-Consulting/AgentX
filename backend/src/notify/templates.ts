import { CreateTemplateInput, type CreateTemplateResult, type TenantContext } from "@pakka/types";
import { AppError } from "../lib/errors";
import { requireRole } from "../lib/tenant";

/**
 * Creates a WhatsApp message template and submits it to Meta on the business's own WhatsApp
 * account (Meta App Review flow).
 *
 * There is no template table in the schema yet (docs/handover.md: template status table, Dev 2)
 * and no Meta submission in the WhatsApp adapter (Dev 1), so this validates the template and the
 * role, then answers `not_available` instead of pretending it was submitted.
 */
export async function createTemplate(
  context: TenantContext,
  rawInput: unknown,
): Promise<CreateTemplateResult> {
  CreateTemplateInput.parse(rawInput);
  requireRole(context, ["owner", "admin"], "create a template");

  throw new AppError(
    "not_available",
    "Submitting templates to Meta isn't switched on yet, so this template was not submitted.",
  );
}
