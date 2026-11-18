// Custom oxlint rules, loaded through `jsPlugins` in .oxlintrc.json.
import type { RuleTester } from "oxlint/plugins-dev";

type Rule = Parameters<RuleTester["run"]>[1];
type Visitor = ReturnType<NonNullable<Rule["create"]>>;
type CallExpression = Parameters<NonNullable<Visitor["CallExpression"]>>[0];
type Expression = CallExpression["callee"];
type Argument = CallExpression["arguments"][number];

// A string is static when every part of it is written in the source.
const isStatic = (node: Argument | undefined): boolean => {
  if (node?.type === "Literal") return typeof node.value === "string";
  if (node?.type === "TemplateLiteral") return node.expressions.length === 0;
  if (node?.type === "BinaryExpression" && node.operator === "+") {
    return isStatic(node.left) && isStatic(node.right);
  }
  return false;
};

const isSqlRaw = (callee: Expression) =>
  callee.type === "MemberExpression" &&
  callee.object.type === "Identifier" &&
  callee.object.name === "sql" &&
  callee.property.type === "Identifier" &&
  callee.property.name === "raw";

// `sql.raw` skips parameter binding, so a value built at runtime becomes
// SQL injection. Static strings stay allowed.
const noDynamicSqlRaw: Rule = {
  meta: {
    type: "problem",
    messages: {
      dynamic:
        "sql.raw takes a static string only. Pass values through the sql`` tag or Drizzle operators (like, eq) so they are bound.",
    },
  },
  create: (context) => ({
    CallExpression(node) {
      if (!isSqlRaw(node.callee)) return;
      if (isStatic(node.arguments[0])) return;
      context.report({ node, messageId: "dynamic" });
    },
  }),
};

export default {
  meta: { name: "cadence" },
  rules: { "no-dynamic-sql-raw": noDynamicSqlRaw },
};
