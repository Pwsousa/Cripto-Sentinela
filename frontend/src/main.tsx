import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "sonner";
import SisdefApp from "./components/SisdefApp";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SisdefApp />
    <Toaster position="bottom-right" theme="dark" richColors />
  </React.StrictMode>,
);
