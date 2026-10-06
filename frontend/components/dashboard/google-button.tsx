"use client";

import { useActionState } from "react";
import { ErrorState } from "@/components/shared/states";
import { signInWithGoogle, type OAuthState } from "@/lib/auth/actions";

/** "Continue with Google" for /login and /signup. `next` is where a member lands afterwards. */
export function GoogleButton({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<OAuthState, FormData>(signInWithGoogle, {});
  return (
    <form action={action} className="app-form">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {state.error ? <ErrorState compact title="Couldn't open Google sign-in" description={state.error} /> : null}
      <div className="app-actions">
        <button type="submit" className="btn btn-secondary" disabled={pending}>
          {pending ? "Opening Google…" : "Continue with Google"}
        </button>
      </div>
    </form>
  );
}
