// Bundles each entry point into one file with its dependencies inlined, so the production image needs
// no node_modules: the Dockerfile copies dist/ and drizzle/ and nothing else. It also inlines
// packages/shared, which has no build of its own (its main points at src/index.ts).
//
// Do not pass `packages: "external"`: it externalizes any import resolved through node_modules,
// including workspace packages (which are only symlinks there), and @rinia/shared would then be
// missing at runtime.
//
// The target is "bun", not "node": with "node" the bundler inlines the npm `ws` package, and on Bun its
// WebSocket upgrade never completes, so the browser sees every realtime handshake fail. With "bun", `ws` is
// Bun's own implementation. Going back to Node means changing the target, the
// base image and the CMD, and keeping `ws` out of the bundle or installing node_modules.
const entryPoints = ["src/server.ts", "src/db/migrate.ts"];
// The startup log names the version it runs; there is no package.json next to the bundle to read it from.
const { version } = (await Bun.file("package.json").json()) as { version: string };

for (const entryPoint of entryPoints) {
    // One build per entry point keeps every output at the top of dist/ (dist/server.js, dist/migrate.js).
    const result = await Bun.build({
        entrypoints: [entryPoint],
        outdir: "dist",
        target: "bun",
        minify: true,
        sourcemap: "linked",
        define: { "process.env.RINIA_VERSION": JSON.stringify(version) },
    });

    if (!result.success) {
        for (const log of result.logs) console.error(log);
        process.exit(1);
    }

    for (const output of result.outputs) {
        console.log(`  ${output.path.replace(`${process.cwd()}/`, "")}  ${(output.size / 1024).toFixed(1)} KB`);
    }
}
