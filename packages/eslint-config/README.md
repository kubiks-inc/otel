# Front ESLint Config

Shared ESLint configs that workspaces in the monorepo should extend from.

First, choose the config in this directory most appropriate to your use case.
Then, add a `.eslintrc.cjs` file in the root of your workspace:

```js
module.exports = {
  root: true,
  extends: [require.resolve("eslint-config/next")],
};
```
