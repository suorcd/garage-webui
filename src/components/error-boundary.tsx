import { Component, ErrorInfo, ReactNode } from "react";
import { useRouteError } from "react-router-dom";
import { Alert } from "react-daisyui";
import { CircleXIcon } from "lucide-react";
import Button from "./ui/button";

type ErrorFallbackProps = {
  error?: unknown;
  onReset?: () => void;
};

const errorMessage = (error: unknown) => {
  return error instanceof Error ? error.message : "Unknown error";
};

const ErrorFallback = ({ error, onReset }: ErrorFallbackProps) => {
  return (
    <div className="container flex flex-col items-center gap-4 py-16 text-center">
      <Alert status="error" icon={<CircleXIcon />}>
        <span>Something went wrong: {errorMessage(error)}</span>
      </Alert>

      <div className="flex flex-row gap-2">
        {onReset ? (
          <Button color="primary" onClick={onReset}>
            Try again
          </Button>
        ) : (
          <Button color="primary" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        )}
        <Button href="/">Go to dashboard</Button>
      </div>
    </div>
  );
};

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorFallback
          error={this.state.error}
          onReset={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}

export const RouteErrorElement = () => {
  const error = useRouteError();
  return <ErrorFallback error={error} />;
};
