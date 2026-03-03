import { Toaster } from "@/components/ui/sonner";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { RouterProvider } from "react-router-dom";
import { ThemeProvider } from "./components/ui/theme-provider";
import { router } from "./routers";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 seconds
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchInterval: false,
      refetchIntervalInBackground: false,
      retry: false,
    },
  },
});

const localStoragePersister = createAsyncStoragePersister({
  storage: window.localStorage,
  key: "rq-persist",
});

persistQueryClient({
  queryClient,
  persister: localStoragePersister,
  maxAge: 1000 * 60 * 24,
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="theme">
        <div className="min-h-screen bg-background text-foreground antialiased font-sans">
          <RouterProvider router={router} />
          <Toaster position="bottom-center" />
        </div>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
