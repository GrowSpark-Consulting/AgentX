import type { ReactNode } from "react";

// One set of loading / empty / error states for the signed-in app. Styled by styles/app.css with
// the dashboard's design tokens.

interface StateProps {
  title: string;
  description?: ReactNode;
  /** Buttons or links under the text. */
  action?: ReactNode;
  /** Smaller variant for use inside a card or form. */
  compact?: boolean;
}

export function LoadingState({ title = "Loading", description, compact }: Partial<StateProps>) {
  return (
    <div className={`app-state${compact ? " app-state-compact" : ""}`} role="status" aria-live="polite" aria-busy="true">
      <span className="app-spinner" aria-hidden="true" />
      <div>
        <p className="app-state-title">{title}</p>
        {description ? <p className="app-state-text">{description}</p> : null}
      </div>
    </div>
  );
}

export function EmptyState({ title, description, action, compact }: StateProps) {
  return (
    <div className={`app-state app-state-empty${compact ? " app-state-compact" : ""}`}>
      <span className="app-state-mark" aria-hidden="true">i</span>
      <div>
        <p className="app-state-title">{title}</p>
        {description ? <p className="app-state-text">{description}</p> : null}
        {action ? <div className="app-state-actions">{action}</div> : null}
      </div>
    </div>
  );
}

interface ErrorStateProps extends StateProps {
  /** Shows a Try again button. */
  onRetry?: () => void;
  /** Or a link that retries by reloading a route. */
  retryHref?: string;
}

export function ErrorState({ title, description, action, compact, onRetry, retryHref }: ErrorStateProps) {
  return (
    <div className={`app-state app-state-error${compact ? " app-state-compact" : ""}`} role="alert">
      <span className="app-state-mark" aria-hidden="true">!</span>
      <div>
        <p className="app-state-title">{title}</p>
        {description ? <p className="app-state-text">{description}</p> : null}
        {onRetry || retryHref || action ? (
          <div className="app-state-actions">
            {onRetry ? (
              <button type="button" className="btn btn-secondary" onClick={onRetry}>
                Try again
              </button>
            ) : null}
            {retryHref ? (
              <a className="btn btn-secondary" href={retryHref}>
                Try again
              </a>
            ) : null}
            {action}
          </div>
        ) : null}
      </div>
    </div>
  );
}
