import React from "react";
import ErrorPage from "./ErrorPage";
import { reportError } from "../utils/reportError";
import * as Sentry from "@sentry/react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  // Clear error state when resetKey changes without remounting children.
  static getDerivedStateFromProps(nextProps, prevState) {
    if (nextProps.resetKey !== prevState.resetKey) {
      return { hasError: false, error: null, resetKey: nextProps.resetKey };
    }
    return null;
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary] Uncaught error:", error, info);
    reportError(error, { type: "ReactErrorBoundary" });
    Sentry.captureException(error, { extra: { componentStack: info?.componentStack } });
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorPage
          code={500}
          title="Something went wrong"
          message="An unexpected error occurred. The team has been notified."
          error={this.state.error}
        />
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
