import { PageContext } from "@/context/page-context";
import { Suspense, useContext, useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import Sidebar from "../containers/sidebar";
import { ArrowLeft, MenuIcon } from "lucide-react";
import Button from "../ui/button";
import { createDisclosure } from "@/lib/disclosure";
import { Drawer } from "react-daisyui";
import { useAuth } from "@/hooks/useAuth";
import { ErrorBoundary } from "@/components/error-boundary";
import PageLoading from "@/components/ui/page-loading";
import AuthErrorState from "./auth-error-state";

const MainLayout = () => {
  const [sidebar] = useState(() => createDisclosure());
  const { isOpen: sidebarOpen } = sidebar.use();
  const { pathname, search } = useLocation();
  const auth = useAuth();

  // The effect below must run only when the path changes. It reads the
  // disclosure through a ref, so a re-render never closes the sidebar.
  const sidebarRef = useRef(sidebarOpen);

  useEffect(() => {
    sidebarRef.current = sidebarOpen;
  });

  useEffect(() => {
    if (sidebarRef.current) {
      sidebar.close();
    }
  }, [pathname, sidebar]);

  if (auth.isLoading) {
    return <PageLoading className="min-h-svh py-0" />;
  }

  if (auth.isError) {
    return <AuthErrorState onRetry={() => auth.refetch()} />;
  }

  if (!auth.isAuthenticated) {
    return (
      <Navigate
        to={`/auth/login?returnTo=${encodeURIComponent(pathname + search)}`}
        replace
      />
    );
  }

  return (
    <Drawer
      open={sidebarOpen}
      onClickOverlay={sidebar.close}
      className="md:drawer-open h-screen max-h-dvh"
      side={<Sidebar />}
      contentClassName="flex flex-col overflow-hidden"
    >
      <Header onSidebarOpen={() => sidebar.open()} />

      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        <ErrorBoundary>
          <Suspense fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
    </Drawer>
  );
};

type HeaderProps = {
  onSidebarOpen: () => void;
};

const Header = ({ onSidebarOpen }: HeaderProps) => {
  const page = useContext(PageContext);
  const navigate = useNavigate();

  return (
    <header className="bg-base-100 px-4 md:px-8">
      <div className="container h-16 md:h-20 flex flex-row items-center gap-4">
        {page?.prev ? (
          <Button
            onClick={() => navigate(page.prev!, { replace: true })}
            color="ghost"
            shape="circle"
            className="-mx-2"
            aria-label="Back"
          >
            <ArrowLeft />
          </Button>
        ) : null}

        <Button
          icon={MenuIcon}
          color="ghost"
          className="md:hidden -mx-2"
          onClick={onSidebarOpen}
          aria-label="Open sidebar"
        />

        <h1 className="text-xl flex-1 truncate">{page?.title ?? ""}</h1>

        {page?.actions}
      </div>
    </header>
  );
};

export default MainLayout;
