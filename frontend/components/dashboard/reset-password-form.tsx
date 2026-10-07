"use client";

import { useActionState } from "react";
import { ErrorState } from "@/components/shared/states";
import { updatePassword, type NewPasswordState } from "@/lib/auth/actions";

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState<NewPasswordState, FormData>(updatePassword, {});
  return (
    <form action={action} className="app-form" noValidate>
      <div className="field">
        <label htmlFor="password">New password</label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          autoComplete="new-password"
          aria-invalid={state.fields?.password ? true : undefined}
          aria-describedby={state.fields?.password ? "password-error" : "password-hint"}
        />
        {state.fields?.password ? (
          <p id="password-error" className="app-field-error">{state.fields.password}</p>
        ) : (
          <p id="password-hint" className="app-hint">At least 8 characters.</p>
        )}
      </div>
      <div className="field">
        <label htmlFor="confirmPassword">Confirm new password</label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          className="input"
          autoComplete="new-password"
          aria-invalid={state.fields?.confirmPassword ? true : undefined}
          aria-describedby={state.fields?.confirmPassword ? "confirm-error" : undefined}
        />
        {state.fields?.confirmPassword ? <p id="confirm-error" className="app-field-error">{state.fields.confirmPassword}</p> : null}
      </div>
      {state.error ? <ErrorState compact title="Couldn't change your password" description={state.error} /> : null}
      <div className="app-actions">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save new password"}
        </button>
      </div>
    </form>
  );
}
