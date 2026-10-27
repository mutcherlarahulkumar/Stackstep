"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

import { ErrorState } from "./state";

/**
 * Keeps a crash inside one part of a screen (a panel, a sheet, an admin page): that part shows
 * "Couldn't load this" with Try again, and the rest of the app keeps working.
 */
export class SectionBoundary extends Component<{ children: ReactNode; label?: string }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the cause in the console (and in E2E logs); the screen shows friendly copy only.
    console.error(error, info.componentStack);
  }

  override render() {
    if (this.state.failed) {
      return (
        <div className="flex flex-1 items-center justify-center p-6">
          <ErrorState
            message={`${this.props.label ?? "This part"} hit a problem. Try again, or reload the page if it keeps happening.`}
            onRetry={() => this.setState({ failed: false })}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
