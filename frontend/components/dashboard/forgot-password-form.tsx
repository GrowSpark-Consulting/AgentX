"use client";

import Link from "next/link";
import { useActionState } from "react";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { requestPasswordReset, type ResetRequestState } from "@/lib/auth/actions";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<ResetRequestState, FormData>(requestPasswordReset, {});

  // The same message whether or not the address has an account.
  if (state.sent) {
    return (
      <EmptyState
        title="Check your email"
        description="If this address has a Pakka account, we've sent a link to choose a new password. Open it on this device to continue."
        action={
          <Link className="btn btn-secondary" href="/login">
            Back to sign in
          </Link>
        }
      />
    );
  }

  return (
    <form action={action} className="app-form" noValidate>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          className="input"
          autoComplete="email"
          defaultValue={state.email}
          aria-invalid={state.fields?.email ? true : undefined}
          aria-describedby={state.fields?.email ? "email-error" : undefined}
        />
        {state.fields?.email ? <p id="email-error" className="app-field-error">{state.fields.email}</p> : null}
      </div>
      {state.error ? <ErrorState compact title="Couldn't send the link" description={state.error} /> : null}
      <div className="app-actions">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Sending…" : "Send reset link"}
        </button>
      </div>
    </form>
  );
}
