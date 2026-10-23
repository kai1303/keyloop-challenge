import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import { AppRouter } from "./AppRouter";
import "@keyloop-interview/ui/globals.css";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <LazyMotion features={domAnimation} strict>
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <QueryClientProvider client={queryClient}>
        <AppRouter />
      </QueryClientProvider>
    </MotionConfig>
  </LazyMotion>,
);
