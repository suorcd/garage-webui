import { useAuth } from "@/hooks/useAuth";
import { ErrorBoundary } from "@/components/error-boundary";
import PageLoading from "@/components/ui/page-loading";
import AuthErrorState from "./auth-error-state";
import { parseReturnTo } from "@/lib/utils";
import { Navigate, Outlet, useSearchParams } from "react-router-dom";

const AuthLayout = () => {
  const auth = useAuth();
  const [searchParams] = useSearchParams();

  if (auth.isLoading) {
    return <PageLoading className="min-h-svh py-0" />;
  }

  if (auth.isError) {
    return <AuthErrorState onRetry={() => auth.refetch()} />;
  }

  if (auth.isAuthenticated) {
    return (
      <Navigate
        to={parseReturnTo(searchParams.get("returnTo"))}
        replace
      />
    );
  }

  return (
    <div className="min-h-svh flex items-center justify-center">
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
    </div>
  );
};

export default AuthLayout;
