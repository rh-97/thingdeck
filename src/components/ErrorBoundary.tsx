import { Component, type ErrorInfo, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error', error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        className="mx-auto mt-16 max-w-md rounded-2xl border border-line bg-surface p-6 text-center"
      >
        <TriangleAlert className="mx-auto h-8 w-8 text-warn" aria-hidden />
        <h2 className="mt-3 font-semibold">This screen hit a problem</h2>
        <p className="mt-1 text-sm text-muted">{this.state.error.message}</p>
        <button
          className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
          onClick={() => this.setState({ error: null })}
        >
          Try again
        </button>
      </div>
    );
  }
}
