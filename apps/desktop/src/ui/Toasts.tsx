import React from "react";
import { useAppState } from "./state";

export function Toasts() {
  const toasts = useAppState((s) => s.toasts);
  return (
    <div className="toastWrap">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <div className="toastTitle">{t.title}</div>
          <div className="toastBody">{t.body}</div>
        </div>
      ))}
    </div>
  );
}

