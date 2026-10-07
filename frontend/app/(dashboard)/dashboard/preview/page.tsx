import { PakkaRoot, type PakkaRootProps } from "@/components/dashboard/pakka-root";

// TEMPORARY: these URL switches exist for the prototype's demo states and the Playwright visual
// suite. Production data will come from the signed-in tenant, not the URL.
// Defaults match the original component's editor defaults. Every value can be overridden from the
// URL, e.g. /dashboard/preview?theme=dark&frame=phone&account=trial&credits=low&plan=starter&firstDay=1&industry=salon
// The app itself also reads ?screen=<home|inbox|leads|…> and ?chat=<lead id> on mount.
const DEFAULTS: Required<PakkaRootProps> = {
  industry: "re",
  theme: "light",
  frame: "fit",
  account: "paid",
  credits: "healthy",
  plan: "growth",
  firstDay: false,
  productName: "Spark Agent",
};

const OPTIONS = {
  industry: ["re", "salon", "int", "hotel", "rest"],
  theme: ["light", "dark"],
  frame: ["fit", "phone"],
  account: ["paid", "trial", "ended"],
  credits: ["healthy", "low", "zero"],
  plan: ["starter", "growth", "pro"],
} as const;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));
  const props: Record<string, unknown> = { ...DEFAULTS };
  for (const [key, allowed] of Object.entries(OPTIONS)) {
    const v = one(key);
    if (v && (allowed as readonly string[]).includes(v)) props[key] = v;
  }
  const fd = one("firstDay");
  if (fd !== undefined) props.firstDay = fd === "1" || fd === "true";
  const pn = one("productName");
  if (pn) props.productName = pn;
  return <PakkaRoot {...(props as PakkaRootProps)} />;
}
