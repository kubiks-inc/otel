const { resolve } = require("node:path");

const project = resolve(process.cwd(), "tsconfig.json");

module.exports = {
  extends: [
    "@vercel/style-guide/eslint/node",
    "@vercel/style-guide/eslint/typescript",
  ].map((config) => require.resolve(config)),
  parserOptions: {
    project,
  },
  settings: {
    "import/resolver": {
      typescript: {
        project,
      },
    },
  },
  ignorePatterns: ["node_modules/", "dist/", "dist-site/"],
  overrides: [
    {
      files: ["**/*.test.*"],
    },
    {
      files: ["vitest.config.ts"],
      rules: {
        "import/no-default-export": "off",
      },
    },
  ],
};
