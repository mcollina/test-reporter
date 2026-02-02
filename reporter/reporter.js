/**
 * Large Scale Node.js Test Reporter
 *
 * A custom test reporter for node:test designed for large-scale projects.
 * Focuses on visibility, progress tracking, and diagnosing flaky/stuck tests.
 *
 * Usage:
 *   node --test --test-reporter=./reporter/reporter.js
 *
 * Options:
 *   --test-reporter-options=timeout-warning=5000,stuck-threshold=30000,show-passing=true,show-skip=true,progress=auto
 */

const { EOL } = require("os");
const { StateTracker } = require("./state-tracker");
const {
  isTTY,
  useColor,
  printFileHeader,
  printTest,
  printSkippedTest,
  printError,
  printIncompleteTests,
  printNonTTYIncompleteTests,
  printSummary,
  printNonTTYSummary,
  clearLine,
} = require("./printer");

class TestReporter {
  constructor(options = {}) {
    this.options = {
      timeoutWarning: parseInt(options["timeout-warning"]) || 5000,
      stuckThreshold: parseInt(options["stuck-threshold"]) || 30000,
      showPassing: options["show-passing"] !== "false",
      showSkip: options["show-skip"] !== "false",
      progress: options.progress || "auto",
      ...options,
    };

    this.state = new StateTracker();
    this.currentFile = null;
    this.spinnerFrame = 0;
    this.spinnerInterval = null;
    this.stderrBuffer = [];

    // Determine progress mode
    this.progressMode = this.options.progress;
    if (this.progressMode === "auto") {
      this.progressMode = isTTY ? "on" : "off";
    }

    // Set up process exit handlers for stuck test detection (critical feature)
    this.setupExitHandlers();
  }

  /**
   * Set up SIGINT, SIGTERM, and exit handlers to report incomplete tests
   */
  setupExitHandlers() {
    // Increase max listeners to avoid warnings when multiple reporters are created (in tests)
    process.setMaxListeners(20);

    const reportIncomplete = (signal) => {
      const incomplete = this.state.getIncompleteTests();
      if (incomplete.length > 0) {
        // Force output even if we're in the middle of something
        const output = isTTY
          ? printIncompleteTests(incomplete)
          : printNonTTYIncompleteTests(incomplete);
        process.stdout.write(output);
      }
      if (signal) {
        process.exit(1);
      }
    };

    process.on("SIGINT", () => reportIncomplete("SIGINT"));
    process.on("SIGTERM", () => reportIncomplete("SIGTERM"));
    process.on("exit", () => reportIncomplete(null));
  }

  /**
   * Start the spinner for live progress updates
   */
  startSpinner() {
    if (this.progressMode !== "on" || this.spinnerInterval) return;

    this.spinnerInterval = setInterval(() => {
      this.spinnerFrame++;
      this.updateProgress();
    }, 100);
  }

  /**
   * Stop the spinner
   */
  stopSpinner() {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = null;
    }
  }

  /**
   * Update the progress display (for live TTY updates)
   */
  updateProgress() {
    if (this.progressMode !== "on") return;

    // For now, we do simple line-by-line output
    // Full live updates with cursor manipulation would require more complex tracking
  }

  /**
   * Main async generator function - receives test events from node:test
   */
  async *report(source) {
    this.startSpinner();

    try {
      for await (const event of source) {
        yield* this.handleEvent(event);
      }
    } finally {
      this.stopSpinner();
      // Print final summary
      yield this.printFinalSummary();
    }
  }

  /**
   * Handle individual test events
   */
  *handleEvent(event) {
    const { type, data } = event;

    switch (type) {
      case "test:start":
        yield* this.handleTestStart(data);
        break;

      case "test:pass":
        yield* this.handleTestPass(data);
        break;

      case "test:fail":
        yield* this.handleTestFail(data);
        break;

      case "test:complete":
        // Handled in pass/fail, but track completion for stuck detection
        break;

      case "test:skip":
        yield* this.handleTestSkip(data);
        break;

      case "test:stdout":
        // Buffer stdout for now, could display inline in TTY mode
        break;

      case "test:stderr":
        this.stderrBuffer.push(data.message);
        break;

      case "test:diagnostic":
        // Diagnostics can be shown in verbose mode
        break;

      case "test:watch-ready":
        yield this.formatLine(`Watch mode ready${EOL}`);
        break;
    }
  }

  /**
   * Handle test:start event
   */
  *handleTestStart(data) {
    const testInfo = this.state.startTest(data);

    // Check if this is a new file
    if (data.file && data.file !== this.currentFile) {
      this.currentFile = data.file;
      const [passed, total] = this.state.getFileStatus(data.file);
      yield printFileHeader(data.file, passed, total, { isNewFile: true });
    }

    // In TTY mode with progress on, we don't immediately print (wait for completion)
    // In non-TTY mode, we show "running" indicator
    if (this.progressMode === "off") {
      const running = this.state.getRunningByFile().get(data.file) || [];
      const currentTest = running.find((t) => t.id === testInfo.id);
      if (currentTest) {
        yield printTest(currentTest, {
          isRunning: true,
          runningDuration: this.state.getRunningDuration(currentTest),
        });
      }
    }
  }

  /**
   * Handle test:pass event
   */
  *handleTestPass(data) {
    const test = this.state.completeTest(data, { passed: true });
    if (!test) return;

    // Only show passing tests if configured to do so
    if (this.options.showPassing || test.nesting === 0) {
      // In TTY mode, we might want to update in place
      // For now, just print the completed test
      if (this.progressMode === "on") {
        clearLine();
      }
      yield printTest(test, { isRunning: false });
    }
  }

  /**
   * Handle test:fail event
   */
  *handleTestFail(data) {
    const error = data.details?.error || data.error || new Error("Test failed");
    const test = this.state.completeTest(data, { passed: false, error });
    if (!test) return;

    if (this.progressMode === "on") {
      clearLine();
    }

    yield printTest(test, { isRunning: false });
    yield printError(test);
  }

  /**
   * Handle test:skip event
   */
  *handleTestSkip(data) {
    const test = this.state.skipTest(data);
    if (!test) return;

    if (this.options.showSkip) {
      if (this.progressMode === "on") {
        clearLine();
      }
      yield printSkippedTest(test);
    }
  }

  /**
   * Format a line with proper newline handling
   */
  formatLine(content) {
    return content;
  }

  /**
   * Print final summary after all tests complete
   */
  printFinalSummary() {
    const stats = this.state.getStats();
    const failedTests = this.state.getFailedTests();
    const slowTests = this.state.getSlowTests(10).filter((t) => t.duration > this.options.timeoutWarning);

    if (isTTY && useColor) {
      return printSummary(stats, { failedTests, slowTests });
    } else {
      return printNonTTYSummary(stats, { failedTests, slowTests });
    }
  }
}

/**
 * The exported reporter function - creates instance and yields events
 *
 * Node.js test runner expects an async generator function that receives
 * the event source as its parameter.
 */
async function* reporter(source, options = {}) {
  // Options are passed directly by Node.js when using --test-reporter-options
  // They can be either an object or we parse from string if needed
  const parsedOptions = {};

  if (typeof options === "string") {
    // For older Node.js versions or CLI string format
    const opts = options.split(",");
    for (const opt of opts) {
      const [key, value] = opt.split("=");
      if (key && value !== undefined) {
        parsedOptions[key] = value;
      }
    }
  } else if (options && typeof options === "object") {
    Object.assign(parsedOptions, options);
  }

  // Also check environment variable as fallback
  if (process.env.NODE_TEST_REPORTER_OPTIONS) {
    const opts = process.env.NODE_TEST_REPORTER_OPTIONS.split(",");
    for (const opt of opts) {
      const [key, value] = opt.split("=");
      if (key && value !== undefined && !(key in parsedOptions)) {
        parsedOptions[key] = value;
      }
    }
  }

  const instance = new TestReporter(parsedOptions);
  yield* instance.report(source);
}

module.exports = reporter;
module.exports.TestReporter = TestReporter;
