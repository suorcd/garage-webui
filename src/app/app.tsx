import { PageContextProvider } from "@/context/page-context";
import Router from "./router";
import { Toaster } from "sonner";
import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import ThemeProvider from "@/components/containers/theme-provider";
import { createQueryClient } from "./query-client";
import "./styles.css";

const App = () => {
  const [queryClient] = useState(() => createQueryClient());

  return (
    <PageContextProvider>
      <QueryClientProvider client={queryClient}>
        <Router />
      </QueryClientProvider>
      <Toaster richColors />
      <ThemeProvider />
    </PageContextProvider>
  );
};

export default App;
