# Plan: Large Scale Node.js Test Reporter

## Overview
A custom test reporter for `node:test` designed specifically for large-scale projects with hundreds of test files and thousands of tests. The reporter focuses on visibility, progress tracking, and especially diagnosing flaky/stuck tests.

## Goals

1. **File-level visibility**: Pretty print each test file as it's processed
2. **Test-level visibility**: Show each individual test with nesting support
3. **Incomplete test detection (critical)**: When user presses Ctrl-C (or process exits abnormally), print exactly which tests never completed
4. **Real-time progress**: Show what's currently running for large test suites
5. **Clear problem identification**: Help developers identify tests that are blocking/hanging the suite

## Research: Node.js Test Reporter API

From https://nodejs.org/api/test.html:

**Reporter Interface**: A reporter is an async generator function that receives test events:
- `'test:start'` - Test starts execution
- `'test:pass'` - Test passed
- `'test:fail'` - Test failed with error details
- `'test:complete'` - Test completes (always fires)
- `'test:stdout'` - Test writes to stdout
- `'test:test:stderr'` - Test writes to stderr
- `'test:diagnostic'` - Diagnostic information
- `'test:watch-ready'` - Watch mode ready

**Event Structure**:
```typescript
interface TestEvent {
  type: string;
  data: {
    name: string;
    file?: string;
    nesting: number;
    duration_ms?: number;
    error?: Error;
    // ... other fields
  };
}
```

## Architecture

### Core Components

1. **Event Processor**: Receives and categorizes test events
2. **State Tracker**: Maintains state of running/finished tests and files
3. **Timeout Monitor**: Async task that watches for stuck tests
4. **Pretty Printer**: Formats output with colors and hierarchy
5. **Statistics Collector**: Aggregates pass/fail/flaky counts

### Key Design Decisions

1. **Hierarchical Display**: Tests are organized by file → describe → test
2. **Animated Progress**: Show currently running file (like a progress bar)
3. **Timeout Warnings**: Detect tests running longer than expected (optional, disabled by default)
4. **Flaky Detection**: Track tests that pass after retries (if using retry option)
5. **Stuck Test Identification**: On process exit (natural or via SIGINT/SIGTERM), print list of tests that received `test:start` but never received `test:complete`

### Format Design

#### TTY Mode (Interactive Terminal)

**Complete Example:**
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

**User presses Ctrl-C before tests complete:**
```
^C

⚠️  INCOMPLETE TESTS DETECTED

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

**Visual Elements:**
- No borders — uses empty lines and indentation for visual hierarchy
- Unicode status: `✓` (pass), `✗` (fail), `⏳` (running), `⊘` (skip), `⚠️` (warning)
- Dotted lines (......) that can truncate and wrap gracefully at any width
- Live spinner (`•••`) for running tests
- Duration colors: <100ms green, <1s yellow, >1s orange
- File counters showing `[passed/total]`

---

#### Non-TTY Mode (CI, Logs, Pipes)

Clean, parseable output that wraps gracefully:

```
FILE: src/services/user.service.test.ts [3/4]

PASS  UserService > should create user [45ms]
PASS  UserService > should validate email [12ms]
WARN  UserService > should handle edge cases [~5s]
FAIL  UserService > should delete user [150ms]
      AssertionError: Expected user to be deleted
      at src/services/user.service.test.ts:44:17

FILE: src/api/routes.test.ts [2/2]

PASS  GET /users > returns 200 with user list [23ms]
PASS  POST /users > creates new user [67ms]

### PROCESS INTERRUPTED - INCOMPLETE TESTS

The following tests started but never completed:
  (Ordered by start time - the last one likely caused the hang)

[45s]  src/db/connection.test.ts::Database > should handle concurrent connections <-- LONGEST
[12s]  src/cache/redis.test.ts::RedisClient > should reconnect
[ 8s]  src/queue/worker.test.ts::Worker > should process jobs
```

**Visual Elements:**
- Simple section headers with empty lines for breathing room (no borders)
- Status prefix in CAPS: `PASS`, `FAIL`, `WARN`, `SKIP`, `PENDING`
- Duration aligned in right column with `[...]` brackets
- `###` separators for "PROCESS INTERRUPTED" alerts (visible in CI logs)
- Arrow `<-- LONGEST` marker indicates most likely stuck test (longest running incomplete test)
- No ANSI escape codes unless `FORCE_COLOR=1`

---

#### Summary Output (Both Modes)

**TTY Mode (when all tests complete):**
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

**Non-TTY Mode (when all tests complete):**
```
TEST SUITE COMPLETE — 47 files | 312 passed | 3 failed | 5 skipped | 45.2s

FAILED TESTS:
  1. src/services/user.service.test.ts:44 — should delete user
  2. src/api/auth.test.ts:23 — should reject invalid token
  3. src/db/connection.test.ts:87 — should rollback on error

SLOW TESTS (potential flaky tests):
  1. 12.4s  src/db/connection.test.ts — Database > should pool connections
  2. 8.7s   src/cache/redis.test.ts — RedisClient > should reconnect
  3. 5.2s   src/queue/worker.test.ts — Worker > should process jobs

Exit code: 1 (failure)
```

---

#### Output Rules

**For TTY Mode:**
- Colors enabled by default, respect `NO_COLOR` and `FORCE_COLOR`
- No borders — lightweight layout that wraps gracefully on narrow screens
- Inline updates for running tests (no scroll spam)
- Cursor manipulation for live updates only when `progress` is enabled
- Unicode status indicators for compact visual scanning

**For Non-TTY Mode:**
- No colors unless `FORCE_COLOR=1` or `FORCE_COLOR=2`
- No cursor manipulation (no `\r`, no ANSI escapes)
- Each line is self-contained for grep/awk processing
- No borders — whitespace-based visual hierarchy  
- Timestamps prepended when `DEBUG` env var is set  
- Incomplete test alerts use section markers (`###`)

**Universal:**
- File paths relative to project root (cleaner output)
- Durations show unit (ms/s) and maintain consistent width
- Error stacks trimmed to project code (hide node_modules)
- Nested tests shown with indentation/breadcrumbs
- No fixed-width layouts — content wraps naturally for small/large screens alike

## Implementation Plan

### Phase 1: Basic Reporter Structure
- Create `reporter.js` with async generator function
- Handle basic events: start, pass, fail, complete
- Implement nesting-aware indentation

### Phase 2: File and Test Tracking
- Track which file is currently being processed
- Build hierarchy tree (file → suites → tests)
- Display file headers when starting new files

### Phase 3: Stuck Test Detection (Critical)
**Stuck test** = a test that started but never completed before process exit

Implementation:
- Track all tests that receive `test:start` event
- Mark tests as "completed" when receiving `test:complete`, `test:pass`, or `test:fail`
- Register `process.on('exit')`, `process.on('SIGINT')`, `process.on('SIGTERM')` handlers
- On any exit event, check for incomplete tests (started but not finished)
- Print prominent "INCOMPLETE TESTS" report listing all stuck tests with their file paths
- This is the primary diagnostic feature for identifying blocking tests

Note: This is different from "slow" tests which complete but take a long time. True stuck tests never emit completion events.

### Phase 4: Flaky Test Handling
- Display retry count for flaky tests
- Mark tests that passed on retry
- Separate statistics for truly failed vs flaky

### Phase 5: TTY vs Non-TTY Handling
- Detect TTY using `process.stdout.isTTY`
- TTY mode: Use cursor manipulation for real-time progress updates
- Non-TTY mode: Line-based output without animations or cursor movement
- All stuck test warnings printed inline (no clearing/rewriting)
- Add `progress=auto` option (auto-detect), `progress=on`, `progress=off`

### Phase 6: Statistics and Summary
- Final summary with file count, test count, duration
- Group failures by file
- Show list of slowest tests (potential flakiness indicators)

### Phase 7: Configuration Options
Support CLI options via `--test-reporter-options`:
- `timeout-warning=5000` - Warning threshold in ms
- `stuck-threshold=30000` - Stuck test threshold in ms
- `show-passing=true` - Show passing tests (vs only failures)
- `show-skip=true` - Show skipped tests
- `progress=auto` - Progress indicator mode (auto/on/off)

## Files to Create

1. **reporter/reporter.js** - Main reporter implementation
2. **reporter/state-tracker.js** - Tracks running test state
3. **reporter/timeout-monitor.js** - Monitors for stuck tests
4. **reporter/printer.js** - Pretty formatting utilities
5. **reporter/index.js** - Entry point
6. **example/test-sample.js** - Sample tests to demonstrate reporter
7. **README.md** - Usage documentation

## Usage

```bash
# Run with custom reporter
node --test --test-reporter=./reporter/reporter.js

# With options
node --test --test-reporter=./reporter/reporter.js --test-reporter-options=timeout-warning=3000,stuck-threshold=10000
```

## Success Criteria

- [ ] Each test file is clearly identified with its path
- [ ] Tests are shown with nesting (describe → test)
- [ ] **Incomplete test detection**: On SIGINT/SIGTERM/exit, print list of tests that started (`test:start`) but never finished (no `test:complete`)
- [ ] **Incomplete test warning is prominent**: Clearly labeled, with file paths and test names, sorted by time (longest running first = most likely culprit)
- [ ] Final summary shows pass/fail/skip counts per file
- [ ] Slow test report helps identify potential flaky tests
- [ ] Works correctly with parallel test execution (`--test-concurrency`)
- [ ] **TTY mode**: Real-time progress with cursor manipulation
- [ ] **Non-TTY mode**: Clean line-based output without escape sequences
- [ ] **Auto-detection**: Automatically chooses appropriate mode based on `process.stdout.isTTY`
- [ ] **Pretty output**: Clean, modern layout with flowing text that wraps gracefully
- [ ] **Status icons**: Unicode indicators (✓ ✗ ⏳ ⊘ ⚠️) for quick scanning
- [ ] **Visual hierarchy**: Clear nesting with indentation and connecting lines
- [ ] **No borders**: Header-based layout that works on screens of any width
- [ ] **Wrapping friendly**: Text and dotted connectors gracefully handle narrow terminals
- [ ] **Error formatting**: Clean stack traces showing only project code
