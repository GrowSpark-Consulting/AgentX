"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/states";
import { formatError } from "@/lib/errors";

// Server errors reach the browser without their message in production (only `digest`), so the
// formatter shows a generic message; the digest ties it to the server log.
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (error.digest) console.warn(`Dashboard error, digest ${error.digest}`);
  }, [error]);
  const e = formatError(error);
  return <ErrorState title={e.title} description={e.message} onRetry={reset} />;
}
