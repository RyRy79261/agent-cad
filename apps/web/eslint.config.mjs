import next from "eslint-config-next";

/**
 * Flat ESLint config (ESLint 9 / Next 16). `next lint` was removed in Next 16, so
 * the `lint` script now calls `eslint .` directly against this config.
 *
 * @type {import('eslint').Linter.Config[]}
 */
const config = [
  ...next,
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts"],
  },
];

export default config;
