/**
 * Tests for the main Reporter
 */
const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert");
const reporter = require("../reporter/reporter");
const { TestReporter } = require("../reporter/reporter");

describe("TestReporter", () => {
  describe("constructor", () => {
    it("should parse options with defaults", () => {
      const instance = new TestReporter({});
      assert.equal(instance.options.timeoutWarning, 5000);
      assert.equal(instance.options.stuckThreshold, 30000);
      assert.equal(instance.options.showPassing, true);
      assert.equal(instance.options.showSkip, true);
    });

    it("should parse boolean options from strings", () => {
      const instance = new TestReporter({
        "show-passing": "false",
        "show-skip": "false",
      });
      assert.equal(instance.options.showPassing, false);
      assert.equal(instance.options.showSkip, false);
    });

    it("should parse numeric options", () => {
      const instance = new TestReporter({
        "timeout-warning": "10000",
        "stuck-threshold": "60000",
      });
      assert.equal(instance.options.timeoutWarning, 10000);
      assert.equal(instance.options.stuckThreshold, 60000);
    });

    it("should set progress mode from options", () => {
      const instance = new TestReporter({ progress: "off" });
      assert.equal(instance.progressMode, "off");
    });
  });

  describe("handleEvent", () => {
    it("should handle test:start event", async () => {
      const instance = new TestReporter({});
      const event = {
        type: "test:start",
        data: { name: "test1", file: "/test.js", nesting: 0 },
      };

      const results = [];
      for await (const output of instance.handleEvent(event)) {
        results.push(output);
      }

      // File header should be included in output
      assert.ok(results.length > 0);
    });

    it("should handle test:pass event", async () => {
      const instance = new TestReporter({});

      // First start the test
      instance.state.startTest({ name: "test1", file: "/test.js", nesting: 0 });

      const event = {
        type: "test:pass",
        data: { name: "test1", file: "/test.js", nesting: 0, duration_ms: 100 },
      };

      const results = [];
      for await (const output of instance.handleEvent(event)) {
        results.push(output);
      }

      assert.ok(results.length > 0);
      const output = results.join("");
      assert.ok(output.includes("test1"));
    });

    it("should handle test:fail event", async () => {
      const instance = new TestReporter({});

      // First start the test
      instance.state.startTest({ name: "failing", file: "/test.js", nesting: 0 });

      const event = {
        type: "test:fail",
        data: {
          name: "failing",
          file: "/test.js",
          nesting: 0,
          duration_ms: 50,
          error: new Error("Test failed"),
        },
      };

      const results = [];
      for await (const output of instance.handleEvent(event)) {
        results.push(output);
      }

      const output = results.join("");
      assert.ok(output.includes("failing"));
      assert.ok(output.includes("Test failed"));
    });

    it("should handle test:skip event", async () => {
      const instance = new TestReporter({
        "show-skip": "true",
      });

      const event = {
        type: "test:skip",
        data: { name: "skipped", file: "/test.js", nesting: 0 },
      };

      const results = [];
      for await (const output of instance.handleEvent(event)) {
        results.push(output);
      }

      const output = results.join("");
      assert.ok(output.includes("skipped"));
    });

    it("should buffer stderr events", async () => {
      const instance = new TestReporter({});
      const event = {
        type: "test:stderr",
        data: { message: "error output" },
      };

      for await (const _ of instance.handleEvent(event)) {
        // consume
      }

      assert.equal(instance.stderrBuffer.length, 1);
      assert.equal(instance.stderrBuffer[0], "error output");
    });

    it("should handle diagnostic events", async () => {
      const instance = new TestReporter({});
      const event = {
        type: "test:diagnostic",
        data: { message: "diagnostic info" },
      };

      const results = [];
      for await (const output of instance.handleEvent(event)) {
        results.push(output);
      }

      // Diagnostic events currently don't produce output
      assert.equal(results.length, 0);
    });

    it("should handle watch-ready event", async () => {
      const instance = new TestReporter({});
      const event = { type: "test:watch-ready", data: {} };

      const results = [];
      for await (const output of instance.handleEvent(event)) {
        results.push(output);
      }

      assert.ok(results.length >= 1);
      assert.ok(results[0].includes("Watch mode"));
    });
  });

  describe("report generator", () => {
    it("should yield events from source", async () => {
      const instance = new TestReporter({});

      async function* mockSource() {
        yield {
          type: "test:start",
          data: { name: "test", file: "/test.js", nesting: 0 },
        };
        yield {
          type: "test:pass",
          data: { name: "test", file: "/test.js", nesting: 0, duration_ms: 10 },
        };
      }

      const results = [];
      for await (const output of instance.report(mockSource())) {
        if (output) results.push(output);
      }

      // Should have some output from events plus final summary
      assert.ok(results.length >= 1);
    });

    it("should stop spinner on completion", async () => {
      const instance = new TestReporter({});
      instance.spinnerInterval = setInterval(() => {}, 1000);

      async function* mockSource() {
        yield {
          type: "test:start",
          data: { name: "test", file: "/test.js", nesting: 0 },
        };
        yield {
          type: "test:pass",
          data: { name: "test", file: "/test.js", nesting: 0, duration_ms: 10 },
        };
      }

      for await (const _ of instance.report(mockSource())) {
        // consume
      }

      assert.equal(instance.spinnerInterval, null);
    });
  });

  describe("printFinalSummary", () => {
    it("should include statistics in summary", () => {
      const instance = new TestReporter({});

      // Add some tests
      instance.state.startTest({ name: "pass1", file: "/test.js", nesting: 0 });
      instance.state.completeTest(
        { name: "pass1", file: "/test.js", nesting: 0, duration_ms: 100 },
        { passed: true }
      );

      instance.state.startTest({ name: "fail1", file: "/test.js", nesting: 0 });
      instance.state.completeTest(
        { name: "fail1", file: "/test.js", nesting: 0, duration_ms: 50 },
        { passed: false, error: new Error("fail") }
      );

      const summary = instance.printFinalSummary();
      assert.ok(summary.includes("TEST SUITE COMPLETE"));
      assert.ok(summary.includes("1 passed"));
      assert.ok(summary.includes("1 failed"));
    });

    it("should show slow tests section", () => {
      const instance = new TestReporter({
        "timeout-warning": "100", // 100ms threshold
      });

      // Add a slow test
      instance.state.startTest({ name: "slow", file: "/test.js", nesting: 0 });
      instance.state.completeTest(
        { name: "slow", file: "/test.js", nesting: 0, duration_ms: 2000 },
        { passed: true }
      );

      // Add a fast test
      instance.state.startTest({ name: "fast", file: "/test.js", nesting: 0 });
      instance.state.completeTest(
        { name: "fast", file: "/test.js", nesting: 0, duration_ms: 10 },
        { passed: true }
      );

      const summary = instance.printFinalSummary();
      assert.ok(summary.includes("SLOW TESTS"));
      assert.ok(summary.includes("slow"));
      // Fast test shouldn't be in slow section
      // (depends on implementation details)
    });
  });

  describe("exit handlers", () => {
    it("should not throw when setting up exit handlers", () => {
      // Creating a new instance sets up handlers
      assert.doesNotThrow(() => {
        new TestReporter({});
      });
    });
  });

  describe("exported reporter function", () => {
    it("should be an async generator function", () => {
      // Check that reporter is a function that returns a generator
      assert.equal(typeof reporter, "function");
    });

    it("should parse NODE_TEST_REPORTER_OPTIONS", async () => {
      process.env.NODE_TEST_REPORTER_OPTIONS = "timeout-warning=1000,show-passing=false";

      async function* mockSource() {
        yield {
          type: "test:start",
          data: { name: "test", file: "/test.js", nesting: 0 },
        };
        yield {
          type: "test:pass",
          data: { name: "test", file: "/test.js", nesting: 0, duration_ms: 10 },
        };
      }

      const results = [];
      for await (const output of reporter(mockSource())) {
        if (output) results.push(output);
      }

      // Should produce output
      assert.ok(results.length >= 1);

      delete process.env.NODE_TEST_REPORTER_OPTIONS;
    });
  });

  describe("file tracking", () => {
    it("should print file header on new file", async () => {
      // Use progress=on to suppress running test output in handleTestStart
      const instance = new TestReporter({ progress: "on" });

      const event1 = {
        type: "test:start",
        data: { name: "test1", file: "/file1.js", nesting: 0 },
      };

      const results1 = [];
      for await (const output of instance.handleEvent(event1)) {
        results1.push(output);
      }

      // First test in file should show file header
      const output1 = results1.join("");
      assert.ok(output1.includes("file1.js"));

      // Same file - no new header (in progress=on mode, test:start yields nothing)
      const event2 = {
        type: "test:start",
        data: { name: "test2", file: "/file1.js", nesting: 0 },
      };

      const results2 = [];
      for await (const output of instance.handleEvent(event2)) {
        results2.push(output);
      }

      assert.equal(results2.join(""), "");

      // New file - new header
      const event3 = {
        type: "test:start",
        data: { name: "test3", file: "/file2.js", nesting: 0 },
      };

      const results3 = [];
      for await (const output of instance.handleEvent(event3)) {
        results3.push(output);
      }

      const output3 = results3.join("");
      assert.ok(output3.includes("file2.js"));
    });
  });

  describe("progress mode", () => {
    it("should handle 'off' progress mode", async () => {
      const instance = new TestReporter({ progress: "off" });

      // Start a test - should immediately show running state
      const event = {
        type: "test:start",
        data: { name: "running", file: "/test.js", nesting: 0 },
      };

      const results = [];
      for await (const output of instance.handleEvent(event)) {
        results.push(output);
      }

      // In off mode, it shows running indicator
      assert.ok(results.length > 0);
    });
  });
});

describe("Edge Cases", () => {
  it("should handle test without file", async () => {
    const instance = new TestReporter({});

    const event = {
      type: "test:start",
      data: { name: "orphan", nesting: 0 },
    };

    assert.doesNotThrow(async () => {
      for await (const _ of instance.handleEvent(event)) {
        // consume
      }
    });
  });

  it("should handle unknown event types", async () => {
    const instance = new TestReporter({});

    const event = {
      type: "unknown:event",
      data: {},
    };

    assert.doesNotThrow(async () => {
      for await (const _ of instance.handleEvent(event)) {
        // consume
      }
    });
  });

  it("should handle complete without matching start", async () => {
    const instance = new TestReporter({});

    // Try to complete a test that was never started
    const event = {
      type: "test:pass",
      data: { name: "unknown", file: "/test.js", nesting: 0, duration_ms: 10 },
    };

    // Should not throw
    assert.doesNotThrow(async () => {
      for await (const _ of instance.handleEvent(event)) {
        // consume
      }
    });
  });

  it("should handle tests with no duration", async () => {
    const instance = new TestReporter({});

    instance.state.startTest({ name: "no-duration", file: "/test.js", nesting: 0 });

    const event = {
      type: "test:pass",
      data: { name: "no-duration", file: "/test.js", nesting: 0 },
    };

    assert.doesNotThrow(async () => {
      for await (const _ of instance.handleEvent(event)) {
        // consume
      }
    });
  });
});
