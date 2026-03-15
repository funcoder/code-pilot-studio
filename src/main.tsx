import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { LauncherApp } from "./LauncherApp";
import "./styles.css";

const params = new URLSearchParams(window.location.search);
const view = params.get("view");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {view === "launcher" ? <LauncherApp /> : <App />}
  </React.StrictMode>
);
