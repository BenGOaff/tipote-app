// esbuild substitue `process.env.NODE_ENV` au build (cf. build.mjs
// `define`). On déclare le minimum côté TS pour que le compilateur
// ne plante pas — sans pour autant tirer @types/node (qui ramènerait
// tout Node dans le scope du content script, néfaste).

declare const process: {
  env: {
    NODE_ENV: "development" | "production";
  };
};
