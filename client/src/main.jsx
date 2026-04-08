import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

const originalError = console.error;
console.error = (...args) => {
  if (
    typeof args[0] === "string" &&
    (args[0].includes("unknown prop") ||
      args[0].includes("non-boolean attribute") ||
      args[0].includes("does not recognize"))
  ) {
    return;
  }
  originalError(...args);
};

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
