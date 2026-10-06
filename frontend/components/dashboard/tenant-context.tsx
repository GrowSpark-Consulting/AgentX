"use client";

import type { TenantContext } from "@pakka/types";
import { createContext, useContext, type ReactNode } from "react";

const Ctx = createContext<TenantContext | null>(null);

/** Makes the signed-in user's business available to client components. Renders no markup. */
export function TenantProvider({ value, children }: { value: TenantContext; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The current user, role and business. Only usable inside the signed-in dashboard. */
export function useTenant(): TenantContext {
  const value = useContext(Ctx);
  if (!value) throw new Error("useTenant() must be used inside the signed-in dashboard");
  return value;
}
