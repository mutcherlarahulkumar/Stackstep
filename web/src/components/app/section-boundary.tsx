"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

import { reportError } from "@/lib/report-error";

import { ErrorDetails } from "./error-details";
import { ErrorState } from "./state";

/**
 * Keeps a crash inside one part of a screen (a panel, a sheet, an admin page): that part shows
 * "Couldn't load this" with Try again, and the rest of the app keeps working.
 */
export class SectionBoundary extends Component<{ children: ReactNode; label?: string }, { failed: boolean; error: unknown }> {
  override state: { failed: boolean; error: unknown } = { failed: false, error: null };

  static getDerivedStateFromError(error: unknown): { failed: boolean; error: unknown } {
    return { failed: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the cause in the console and the API log; the screen shows friendly copy and a folded detail line.
    console.error(error, info.componentStack);
    const where = (info.componentStack ?? "").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 4).join(" < ");
    reportError(error, `section ${this.props.label ?? ""} ${where}`.trim());
  }

  override render() {
    if (this.state.failed) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6">
          <ErrorState
            message={`${this.props.label ?? "This part"} hit a problem. Try again, or reload the page if it keeps happening.`}
            onRetry={() => this.setState({ failed: false, error: null })}
          />
          <ErrorDetails error={this.state.error} />
        </div>
      );
    }
    return this.props.children;
  }
}
