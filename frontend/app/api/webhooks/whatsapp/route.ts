import { handleWhatsAppVerification } from "@pakka/backend/channels/whatsapp/verify-challenge";

// GET /api/webhooks/whatsapp (public: https://api.pakkaagent.in/webhooks/whatsapp): Meta's verification
// check. Message handling (POST) is not built yet, so other methods get Next's 405.
export const GET = (request: Request) => handleWhatsAppVerification(request);
