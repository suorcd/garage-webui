import { useAuth } from "@/hooks/useAuth";
import { Navigate, Outlet } from "react-router-dom";
import { ErrorBoundary } from "@/components/error-boundary";
import PageLoading from "@/components/ui/page-loading";

const AuthLayout = () => {
  const auth = useAuth();

  if (auth.isLoading) {
    return <PageLoading className="min-h-svh py-0" />;
  }

  if (auth.isAuthenticated) {
    return <Navigate to="/" replace />;
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
