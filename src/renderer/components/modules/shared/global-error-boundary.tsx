import { Component, type ReactNode } from "react";
import { createLogger } from "@/services/logger";

const log = createLogger("error-boundary", "crash");

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    log.error("Uncaught render error", {
      error: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const isDev =
        typeof import.meta !== "undefined" && (import.meta as any).env?.MODE !== "production";

      return (
        <div className="flex h-screen w-screen items-center justify-center bg-background">
          <div className="mx-4 max-w-md text-center">
            <h1 className="mb-2 font-semibold text-foreground text-[length:var(--font-size-16)]">
              Something went wrong
            </h1>
            <p className="mb-4 text-muted-foreground text-[length:var(--font-chat-message)]">
              An unexpected error occurred. You can try to recover.
            </p>
            {isDev && this.state.error && (
              <pre className="mb-4 max-h-40 overflow-auto rounded-md bg-muted p-3 text-left font-mono text-[length:var(--font-code)] text-muted-foreground">
                {this.state.error.message}
                {"\n"}
                {this.state.error.stack}
              </pre>
            )}
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-[length:var(--font-chat-message)] hover:bg-primary/90"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
