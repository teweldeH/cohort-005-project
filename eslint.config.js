import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["build/", ".react-router/"] },
  {
    files: ["app/**/*.{ts,tsx}"],
    extends: [tseslint.configs.base],
    // Registered so existing `eslint-disable react-hooks/...` comments resolve.
    plugins: { "react-hooks": reactHooks },
    rules: {
      // `!!x` hides the conversion; write `Boolean(x)` or a real comparison.
      "no-implicit-coercion": ["error", { boolean: true }],
    },
  }
);
