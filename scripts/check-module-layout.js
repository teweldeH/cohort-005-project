// Fails when a module in app/modules/ is missing a part of the layout in
// app/modules/README.md: an entry point at its root, a lib/ folder, and at
// least one test in tests/. A module without them is shallow or untested.
// Usage: node scripts/check-module-layout.js

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MODULES = "app/modules";

const entries = (dir) => readdirSync(dir, { withFileTypes: true });

const problems = entries(MODULES)
  .filter((entry) => entry.isDirectory())
  .flatMap(({ name }) => {
    const dir = join(MODULES, name);
    const missing = [];
    const hasEntryPoint = entries(dir).some(
      (entry) => entry.isFile() && /\.tsx?$/.test(entry.name)
    );
    if (!hasEntryPoint)
      missing.push("an entry point (index.ts or similar) at its root");
    if (!existsSync(join(dir, "lib"))) missing.push("a lib/ folder");
    const tests = join(dir, "tests");
    const hasTest =
      existsSync(tests) &&
      entries(tests).some((entry) => /\.test\.tsx?$/.test(entry.name));
    if (!hasTest) missing.push("a test in tests/ (*.test.ts)");
    return missing.map((part) => `  ${dir}: needs ${part}`);
  });

if (problems.length > 0) {
  console.error(`These modules do not follow ${MODULES}/README.md:\n`);
  console.error(problems.join("\n"));
  console.error(`
Copy the layout of ${MODULES}/example/. The entry points stay small, the
implementation goes in lib/, and the tests call the entry points.`);
  process.exit(1);
}
