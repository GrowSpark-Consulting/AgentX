"use client";

import { useActionState } from "react";
import { ErrorState } from "@/components/shared/states";
import { login, type LoginState } from "@/lib/auth/actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="app-form" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
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
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          className="input"
          autoComplete="current-password"
          aria-invalid={state.fields?.password ? true : undefined}
          aria-describedby={state.fields?.password ? "password-error" : undefined}
        />
        {state.fields?.password ? <p id="password-error" className="app-field-error">{state.fields.password}</p> : null}
      </div>
      {state.error ? <ErrorState compact title="Couldn't sign you in" description={state.error} /> : null}
      <div className="app-actions">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </form>
  );
}
