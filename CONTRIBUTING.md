# Contributing

## Setup

```bash
git clone https://github.com/CHANDARA-code/agy-bridge.git agy-bridge
cd agy-bridge
npm test
npm run build:panel
```

The bridge has no runtime dependencies. Only the web panel (`panel/`) has its own `package.json`.

## Tests

`npm run check` verifies syntax and that the role lists, personas and README agree. `npm test` runs `test/server.test.js` against a fake agent (`test/fake-agy.sh`), so it needs neither `agy` nor a Google account. Add a fake mode to `test/fake-agy.sh` when you need the agent to behave in a new way.

A test should be able to fail: check that it fails against the code it covers before you rely on it.

## Pull requests

- Keep a change to one concern and describe what it fixes or adds.
- Include or update tests for behaviour changes.
- Run `npm test` and, for panel changes, `npm --prefix panel run build`.

## CI

Every pull request runs `.github/workflows/ci.yml`: the checks above, a panel build, the tests on Ubuntu and macOS with Node 20 and 22, and a dependency audit (informational). See [RELEASING.md](RELEASING.md) for how releases are published.
