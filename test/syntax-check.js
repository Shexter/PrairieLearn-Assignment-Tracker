const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const roots = ["Chrome", "Firefox", "shared"];
for (const root of roots) {
  for (const name of fs.readdirSync(root)) {
    const file = path.join(root, name);
    if (fs.statSync(file).isFile() && file.endsWith(".js")) execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
  }
}
console.log("JavaScript syntax checks passed.");
