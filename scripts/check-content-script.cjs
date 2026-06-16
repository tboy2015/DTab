const fs = require("node:fs");
const path = require("node:path");

const contentScriptPath = path.join(process.cwd(), "dist", "translateFloatingButton.js");
const source = fs.readFileSync(contentScriptPath, "utf8");

if (/^\s*(?:import|export)\s/m.test(source)) {
  console.error("translateFloatingButton.js must be a classic content script without top-level import/export.");
  process.exit(1);
}
