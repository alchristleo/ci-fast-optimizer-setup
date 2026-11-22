# Project notes

## Local gate

Run this before every commit:

```
bun run test:all && bun run check && bun run lint && bun run fmt:check && bun scripts/bench.ts --charts --check && bun scripts/bench.ts --readme --check
```

Plain `bun test` runs only `test/` (`bunfig.toml` sets the root). `bun run test:all` also runs the tests in `scripts/`.
