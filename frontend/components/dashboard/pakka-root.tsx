"use client";
import dynamic from "next/dynamic";

export type PakkaRootProps = {
  industry?: "re" | "salon" | "int" | "hotel" | "rest";
  theme?: "light" | "dark";
  frame?: "fit" | "phone";
  account?: "paid" | "trial" | "ended";
  credits?: "healthy" | "low" | "zero";
  plan?: "starter" | "growth" | "pro";
  firstDay?: boolean;
  productName?: string;
};

// The app measures the window and reads the URL on mount, so it renders on the client only
// (as the original did).
const PakkaApp = dynamic(() => import("./pakka-app"), { ssr: false });

export function PakkaRoot(props: PakkaRootProps) {
  return (
    <div id="dc-root">
      <PakkaApp {...props} />
    </div>
  );
}
