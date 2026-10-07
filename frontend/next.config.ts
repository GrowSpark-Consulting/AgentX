import type { NextConfig } from "next";

// The frontend serves pages and sign-in only. API routes, webhooks and Inngest live on the API
// service (backend/, on Railway); the browser reaches it through NEXT_PUBLIC_API_URL.
const nextConfig: NextConfig = {};

export default nextConfig;
