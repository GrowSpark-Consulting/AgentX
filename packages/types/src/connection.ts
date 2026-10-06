import { z } from "zod";

// Browser-safe shapes only. The secret-bearing whatsapp_connections row type (token_enc,
// app_secret_enc) lives in backend and must never be imported by the frontend.

export const ConnectionMethod = z.enum(["embedded_signup", "assisted", "manual_byo"]);
export type ConnectionMethod = z.infer<typeof ConnectionMethod>;

export const TokenType = z.enum(["business", "system_user"]);
export type TokenType = z.infer<typeof TokenType>;

export const ConnectionStatus = z.enum([
  "pending",
  "validating",
  "active",
  "failed",
  "disconnected",
]);
export type ConnectionStatus = z.infer<typeof ConnectionStatus>;

// One row of the whatsapp_connections_public view, snake_case as the database returns it.
export const WhatsAppConnectionPublic = z.object({
  id: z.uuid(),
  tenant_id: z.uuid(),
  method: ConnectionMethod,
  waba_id: z.string(),
  phone_number_id: z.string(),
  display_phone: z.string().nullable(),
  verified_name: z.string().nullable(),
  coexistence: z.boolean(),
  status: ConnectionStatus,
  last_check: z.record(z.string(), z.unknown()), // one entry per validation check
  quality_rating: z.string().nullable(),
  messaging_limit: z.string().nullable(),
  created_at: z.string(),
});
export type WhatsAppConnectionPublic = z.infer<typeof WhatsAppConnectionPublic>;

// Body of POST /api/admin/whatsapp/manual. Carries secrets: post once, encrypt on the server,
// never echo back or keep in client state.
export const ManualConnectInput = z.object({
  tenantId: z.uuid(),
  wabaId: z.string().min(1),
  phoneNumberId: z.string().min(1),
  token: z.string().min(1),
  tokenType: TokenType,
  appSecret: z.string().min(1),
  displayPhone: z.string().optional(),
  clientBusinessId: z.string().optional(),
});
export type ManualConnectInput = z.infer<typeof ManualConnectInput>;
