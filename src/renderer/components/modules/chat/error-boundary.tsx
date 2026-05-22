import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ChatErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ClaudeChat] Error boundary caught:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex size-full flex-col items-center justify-center gap-3 p-4">
          <p className="text-[length:var(--font-chat-message)] text-muted-foreground">
            Chat unavailable due to a rendering error.
          </p>
          <button
            onClick={this.handleReset}
            className="rounded-md bg-muted px-3 py-1 text-[length:var(--font-chat-message)] text-foreground transition-colors hover:bg-muted/80"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}