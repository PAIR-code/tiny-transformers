# Weblab Examples

Typecheck: 

```sh
npx tsc -p weblab-examples/tsconfig.json
```

Build

```sh
npx esbuild weblab-examples/cell1.worker.ts --bundle --sourcemap --outfile=weblab-examples/distr/cell1.worker.js
```