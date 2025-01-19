# Weblab Examples

Typecheck: 

```sh
npx tsc -p weblab-examples/tsconfig.json
```

Build

```sh
npx ts-node src/weblab-examples/build.script.ts
```

Serve

```sh
esbuild app.ts --bundle --outdir=dist --serve
```