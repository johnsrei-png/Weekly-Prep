import React from "react";
import ReactDOM from "react-dom/client";
import MealPlanner from "./MealPlanner.jsx";

const style = document.createElement("style");
style.textContent = `
  * { box-sizing: border-box; }
  html, body { margin: 0; max-width: 100%; overflow-x: hidden; }
  #root { max-width: 100%; overflow-x: hidden; }
  input, select, button, textarea { font-family: inherit; max-width: 100%; }
  input:focus, select:focus, button:focus-visible, textarea:focus-visible { outline: 2px solid #6B7B5A; outline-offset: 1px; }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <MealPlanner />
  </React.StrictMode>
);
