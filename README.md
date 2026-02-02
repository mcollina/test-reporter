# Large Scale Node.js Test Reporter

A custom test reporter for `node:test` designed specifically for large-scale projects with hundreds of test files and thousands of tests. Focuses on visibility, progress tracking, and especially diagnosing flaky/stuck tests.

## Features

- **📄 File-level visibility**: Pretty print each test file as it's processed with pass/total counters
- **🧪 Test-level visibility**: Show each individual test with nesting support (describe → test)
- **⏳ Incomplete test detection (critical)**: When Ctrl-C is pressed, print exactly which tests never completed
- **💨 Real-time progress**: Show what's currently running for large test suites
- **⚡ Slow test detection**: Identify potential flaky tests by duration
- **🎨 Beautiful TTY output**: Colors, unicode icons, and elegant formatting
- **📋 Clean CI output**: Line-based, grep-friendly format when piped

## Installation

```bash
# Clone or copy the reporter directory to your project
cp -r reporter/ ./your-project/reporter/
```

## Usage

### Basic Usage

```bash
node --test --test-reporter=./reporter/reporter.js
```

### With Options

Options can be set via environment variables:

```bash
# Set options via environment
NODE_TEST_REPORTER_OPTIONS="timeout-warning=3000,stuck-threshold=10000,progress=off" \
  node --test --test-reporter=./reporter/reporter.js
```

### With Parallel Execution

The reporter supports parallel test execution:

```bash
node --test --test-reporter=./reporter/reporter.js --test-concurrency=4
```

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `timeout-warning` | `5000` | Threshold (ms) for considering a test "slow" |
| `stuck-threshold` | `30000` | Threshold (ms) before warning about potentially stuck tests |
| `show-passing` | `true` | Show passing tests (set to `false` to see only failures) |
| `show-skip` | `true` | Show skipped tests |
| `progress` | `auto` | Progress mode: `auto`, `on`, or `off` |

## Example Output

### TTY Mode (Interactive Terminal)

```
📄 src/services/user.service.test.ts [3/4]

  ✓ UserService
    ✓ should create user ................................... 45ms
    ✓ should validate email ................................ 12ms
    ⏳ should handle edge cases ............................. ~5s •••
    ✗ should delete user ................................... 150ms

      AssertionError: Expected user to be deleted
      at src/services/user.service.test.ts:44:17

📄 src/api/routes.test.ts [2/2]

  ✓ GET /users
    ✓ returns 200 with user list ........................... 23ms

  ✓ POST /users
    ✓ creates new user ..................................... 67ms
```

### Incomplete Tests Warning (Ctrl-C Pressed)

```
^C

⚠️ INCOMPLETE TESTS DETECTED

These tests started but never completed. The test at the bottom ran longest
and is most likely the one blocking:

⏳ src/db/connection.test.ts
   └─ Database › should handle concurrent connections (45s ago)

⏳ src/cache/redis.test.ts
   └─ RedisClient › should reconnect (12s ago)

⏳ src/queue/worker.test.ts
   └─ Worker › should process jobs (8s ago)

💡 Tip: Check the last test for: infinite loops, blocking sync calls,
   unawaited async, database deadlocks, or hanging network requests
```

### Final Summary

```
✓ TEST SUITE COMPLETE — 47 files | 312 passed | 3 failed | 5 skipped | 45.2s

❌ FAILURES (3):
  1. src/services/user.service.test.ts:44 — should delete user
  2. src/api/auth.test.ts:23 — should reject invalid token
  3. src/db/connection.test.ts:87 — should rollback on error

⚡ SLOW TESTS (potential flaky tests):
  1. 12.4s  src/db/connection.test.ts — Database › should pool connections
  2. 8.7s   src/cache/redis.test.ts — RedisClient › should reconnect
  3. 5.2s   src/queue/worker.test.ts — Worker › should process jobs
```

### Non-TTY Mode (CI/Pipes)

```
FILE: src/services/user.service.test.ts [3/4]

PASS  UserService > should create user [45ms]
PASS  UserService > should validate email [12ms]
WARN  UserService > should handle edge cases [~5s]
FAIL  UserService > should delete user [150ms]
      AssertionError: Expected user to be deleted
      at src/services/user.service.test.ts:44:17

### PROCESS INTERRUPTED - INCOMPLETE TESTS

The following tests started but never completed:
  (Ordered by start time - the last one likely caused the hang)

[45s]  src/db/connection.test.ts::Database > should handle concurrent connections <-- LONGEST
[12s]  src/cache/redis.test.ts::RedisClient > should reconnect
[ 8s]  src/queue/worker.test.ts::Worker > should process jobs
```

## Trying the Examples

Run the example tests to see the reporter in action:

```bash
node --test --test-reporter=./reporter/reporter.js example/
```

## Running the Reporter's Own Tests

```bash
node --test test/
```

Or with the reporter itself (meta!):

```bash
node --test --test-reporter=./reporter/reporter.js test/
```

## Architecture

```
reporter/
├── index.js          # Entry point
├── reporter.js       # Main async generator - handles node:test events
├── state-tracker.js  # Tracks running/finished test state
└── printer.js        # Formatting utilities
```

### Event Flow

1. `node:test` sends events through the async generator
2. `reporter.js` receives events (`test:start`, `test:pass`, `test:fail`, etc.)
3. `state-tracker.js` maintains a map of tests by file and completion status
4. `printer.js` formats output for TTY or non-TTY environments
5. On `SIGINT`/`SIGTERM`/`exit`, incomplete tests are reported

## Why This Reporter?

### Problem: Stuck Tests in Large Codebases

In large projects with hundreds of test files, tests can hang due to:
- Infinite loops in async code
- Unawaited promises
- Database connection deadlocks
- Network request timeouts
- Blocking synchronous calls

**Without visibility**, you just see a hung test runner with no idea which test is stuck.

### Solution: Incomplete Test Detection

This reporter tracks every test that receives `test:start` and compares it to `test:complete`. If a test never completes (common on SIGINT), it reports exactly which tests were stuck.

The longest-running incomplete test is shown last — that's most likely your culprit.

## License

MIT
