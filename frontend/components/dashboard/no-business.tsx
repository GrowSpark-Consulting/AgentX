import Link from "next/link";
import { EmptyState } from "@/components/shared/states";

// What dashboard pages show (development only) to a signed-in account with no business yet. It says
// plainly that there is no business data; it never shows sample data as if it were theirs.

/** An empty section: nothing to show until this account has a business. */
export function NoBusinessNotice({ title = "No business data", detail }: { title?: string; detail: string }) {
  return (
    <div data-testid="no-business">
      <EmptyState
        compact
        title={title}
        description={`This account isn't linked to a business yet, so ${detail}.`}
        action={
          // A link only: setting up a business is the onboarding flow's job, nothing is created here.
          <Link className="btn btn-secondary" href="/onboarding">
            Start a free trial
          </Link>
        }
      />
    </div>
  );
}

/** A whole page that needs a business: its heading, then the empty state. */
export function NoBusinessPage({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return (
    <div className="app-page">
      <div>
        <p className="app-eyebrow">{eyebrow}</p>
        <h1 className="app-h1">{title}</h1>
      </div>
      <NoBusinessNotice detail={detail} />
    </div>
  );
}
