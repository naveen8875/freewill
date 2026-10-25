import { Component, type ErrorInfo, type ReactNode } from "react";

interface State { error: Error | null }

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("freewill UI boundary", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="fatal-recovery" role="alert">
        <h1>The world view encountered an error.</h1>
        <p>Your local saves remain intact. Reload the interface to reconstruct the renderer from persisted state.</p>
        <pre>{this.state.error.message}</pre>
        <button onClick={() => window.location.reload()}>Reload freewill</button>
      </main>
    );
  }
}
