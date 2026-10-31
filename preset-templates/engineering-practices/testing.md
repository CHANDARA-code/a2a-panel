---
title: Testing practices
roles: [test-engineer, code-reviewer, lead-software-engineer]
---
## Proportion
- Many fast unit tests covering normal, boundary and error paths; fewer integration tests across real seams (a real database, a real HTTP call); a few end-to-end tests, only for critical journeys such as sign-in or checkout.

## Tests with teeth
- A test must fail when the code is broken: break the implementation on purpose, see the test fail, then restore it.
- Watch for tests that assert against a mock instead of the real path, assert something that is always true, are skipped, or don't await the async work they check.

## Independence
- No dependence on test order or on state left by another test; each test creates and cleans up its own data.
- Mock the network, time and randomness on purpose, never by accident.

## Flaky tests
- A test that fails only sometimes points to a race in the code or in the test. Find the cause; never paper over it with retries or longer timeouts.

## Reporting
- Quote the failing test's name and its assertion output.
- Coverage is a signal, not a goal: well-aimed tests that fail on bugs beat a high percentage that don't.
- Use the project's existing test framework, helpers and naming.
