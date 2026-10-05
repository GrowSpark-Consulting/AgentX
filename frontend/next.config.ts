import type { NextConfig } from "next";

// The api.* hosts serve only route handlers: api.pakkaagent.in/webhooks/whatsapp
// maps to /api/webhooks/whatsapp. Production, staging, and api.localhost for
// testing the rewrite on a dev machine. Next wraps this in ^...$ and strips the port,
// so the alternation must be grouped or the anchors bind to one branch only.
export const API_HOST_PATTERN = String.raw`(?:api(?:-staging)?\.pakkaagent\.in|api\.localhost)`;

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/:path((?!api/).*)",
          has: [{ type: "host", value: API_HOST_PATTERN }],
          destination: "/api/:path",
        },
      ],
    };
  },
};

export default nextConfig;
