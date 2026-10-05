// Liveness check for deploys and DNS: https://api.pakkaagent.in/health
export function GET() {
  return Response.json({
    ok: true,
    env: process.env.VERCEL_ENV ?? "local",
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
  });
}
