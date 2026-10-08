// The real screens' section header, as in the /dashboard/preview prototype and the Knowledge base
// (features/knowledge/services-editor.tsx): uppercase title over a 2px rule, actions on the right.

export const sectionHead = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  borderBottom: "2px solid var(--color-text)",
  paddingBottom: "8px",
  gap: "12px",
} as const;

export const sectionTitle = { margin: "0", fontSize: "13px", letterSpacing: ".08em", textTransform: "uppercase" } as const;
