import { describe, it } from "vitest";
import { RuleTester } from "oxlint/plugins-dev";
import plugin from "./oxlint-plugin";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { sourceType: "module" },
});

const dynamicArgument = { messageId: "dynamicArgument" };

ruleTester.run("no-dynamic-sql-raw", plugin.rules["no-dynamic-sql-raw"], {
  valid: [
    `sql.raw("DESC")`,
    "sql.raw(`created_at DESC`)",
    `sql.raw("created_at" + " DESC")`,
    "sql`title LIKE ${term}`",
    `other.raw(term)`,
  ],
  invalid: [
    { code: "sql.raw(`title LIKE '%${search}%'`)", errors: [dynamicArgument] },
    {
      code: `sql.raw("title LIKE '" + search + "'")`,
      errors: [dynamicArgument],
    },
    { code: `sql.raw(search)`, errors: [dynamicArgument] },
    { code: `sql.raw(column.trim())`, errors: [dynamicArgument] },
    { code: `sql.raw()`, errors: [dynamicArgument] },
  ],
});
