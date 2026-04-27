import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { OverlayApp } from "./ui/OverlayApp";
import "./ui/styles.css";

const isOverlay = window.location.hash === "#overlay";
if (isOverlay) {
  document.documentElement.classList.add("overlayMode");
  document.body.classList.add("overlayMode");
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isOverlay ? <OverlayApp /> : <App />}
  </React.StrictMode>,
);

