import { RouterProvider as TanRouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./main.css";
import { router } from "./routes";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

createRoot(rootEl).render(
  <StrictMode>
    <TanRouterProvider router={router} />
  </StrictMode>,
);
