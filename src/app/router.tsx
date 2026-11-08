import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";
import { lazy, Suspense } from "react";
import AuthLayout from "@/components/layouts/auth-layout";
import MainLayout from "@/components/layouts/main-layout";
import { RouteErrorElement } from "@/components/error-boundary";
import PageLoading from "@/components/ui/page-loading";
import NotFoundPage from "@/pages/not-found";
import { BASE_PATH } from "@/lib/consts";

const LoginPage = lazy(() => import("@/pages/auth/login"));
const ClusterPage = lazy(() => import("@/pages/cluster/page"));
const HomePage = lazy(() => import("@/pages/home/page"));
const BucketsPage = lazy(() => import("@/pages/buckets/page"));
const ManageBucketPage = lazy(() => import("@/pages/buckets/manage/page"));
const KeysPage = lazy(() => import("@/pages/keys/page"));

const router = createBrowserRouter(
  [
    {
      path: "/auth",
      Component: AuthLayout,
      errorElement: <RouteErrorElement />,
      children: [
        {
          index: true,
          element: <Navigate to="login" replace />,
        },
        {
          path: "login",
          Component: LoginPage,
        },
      ],
    },
    {
      path: "/",
      Component: MainLayout,
      errorElement: <RouteErrorElement />,
      children: [
        {
          index: true,
          Component: HomePage,
        },
        {
          path: "cluster",
          Component: ClusterPage,
        },
        {
          path: "buckets",
          children: [
            { index: true, Component: BucketsPage },
            { path: ":id", Component: ManageBucketPage },
          ],
        },
        {
          path: "keys",
          Component: KeysPage,
        },
        {
          path: "*",
          Component: NotFoundPage,
        },
      ],
    },
  ],
  {
    basename: BASE_PATH,
  }
);

const Router = () => {
  return (
    <Suspense fallback={<PageLoading className="min-h-svh py-0" />}>
      <RouterProvider router={router} />
    </Suspense>
  );
};

export default Router;
