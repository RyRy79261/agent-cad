"use client";

import * as React from "react";

interface Props {
  /** Re-mounts the boundary (clears the error) when this key changes — e.g. a new artifact URL. */
  resetKey?: string;
  fallback: (error: Error, reset: () => void) => React.ReactNode;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render/runtime errors from the R3F/gcode-preview viewers so a bad STL
 * shows a message instead of blanking the whole app (FR-VIEW-7). Resets when
 * `resetKey` changes so a new, valid artifact recovers automatically.
 */
export class ViewerErrorBoundary extends React.Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  reset = () => this.setState({ error: null });

  override render() {
    if (this.state.error) return this.props.fallback(this.state.error, this.reset);
    return this.props.children;
  }
}
