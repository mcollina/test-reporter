/**
 * Tests for StateTracker
 */
const { describe, it } = require("node:test");
const assert = require("node:assert");
const { StateTracker } = require("../reporter/state-tracker");

describe("StateTracker", () => {
  describe("startTest", () => {
    it("should track a new test", () => {
      const tracker = new StateTracker();
      const data = {
        name: "test1",
        file: "/path/to/file.js",
        nesting: 0,
      };

      const test = tracker.startTest(data);

      assert.equal(test.name, "test1");
      assert.equal(test.file, "/path/to/file.js");
      assert.equal(test.nesting, 0);
      assert.equal(test.completed, false);
      assert.ok(test.startTime > 0);
    });

    it("should track tests by file", () => {
      const tracker = new StateTracker();
      tracker.startTest({ name: "test1", file: "/file.js", nesting: 0 });
      tracker.startTest({ name: "test2", file: "/file.js", nesting: 0 });
      tracker.startTest({ name: "test3", file: "/other.js", nesting: 0 });

      const testsByFile = tracker.getTestsByFile();
      assert.equal(testsByFile.get("/file.js").length, 2);
      assert.equal(testsByFile.get("/other.js").length, 1);
    });

    it("should increment total test count", () => {
      const tracker = new StateTracker();
      assert.equal(tracker.stats.totalTests, 0);

      tracker.startTest({ name: "test1", file: "/file.js", nesting: 0 });
      assert.equal(tracker.stats.totalTests, 1);

      tracker.startTest({ name: "test2", file: "/file.js", nesting: 0 });
      assert.equal(tracker.stats.totalTests, 2);
    });
  });

  describe("completeTest", () => {
    it("should mark test as passed", () => {
      const tracker = new StateTracker();
      const data = { name: "test1", file: "/file.js", nesting: 0 };

      tracker.startTest(data);
      const test = tracker.completeTest({ ...data, duration_ms: 100 }, { passed: true });

      assert.equal(test.completed, true);
      assert.equal(test.passed, true);
      assert.equal(test.duration, 100);
    });

    it("should mark test as failed", () => {
      const tracker = new StateTracker();
      const data = { name: "test1", file: "/file.js", nesting: 0 };

      tracker.startTest(data);
      const error = new Error("Test failed");
      const test = tracker.completeTest({ ...data, duration_ms: 50 }, { passed: false, error });

      assert.equal(test.completed, true);
      assert.equal(test.passed, false);
      assert.equal(test.error, error);
    });

    it("should update statistics correctly", () => {
      const tracker = new StateTracker();

      // Start and pass a test
      tracker.startTest({ name: "test1", file: "/file.js", nesting: 0 });
      tracker.completeTest(
        { name: "test1", file: "/file.js", nesting: 0, duration_ms: 10 },
        { passed: true }
      );

      // Start and fail a test
      tracker.startTest({ name: "test2", file: "/file.js", nesting: 0 });
      tracker.completeTest(
        { name: "test2", file: "/file.js", nesting: 0, duration_ms: 20 },
        { passed: false }
      );

      assert.equal(tracker.stats.passed, 1);
      assert.equal(tracker.stats.failed, 1);
    });
  });

  describe("getIncompleteTests", () => {
    it("should return empty array when all tests complete", () => {
      const tracker = new StateTracker();

      tracker.startTest({ name: "test1", file: "/file.js", nesting: 0 });
      tracker.completeTest(
        { name: "test1", file: "/file.js", nesting: 0, duration_ms: 10 },
        { passed: true }
      );

      const incomplete = tracker.getIncompleteTests();
      assert.equal(incomplete.length, 0);
    });

    it("should return incomplete tests sorted by start time", async () => {
      const tracker = new StateTracker();

      // Start first test
      const test1Data = { name: "test1", file: "/file.js", nesting: 0 };
      tracker.startTest(test1Data);

      // Small delay
      await new Promise((r) => setTimeout(r, 10));

      // Start second test
      const test2Data = { name: "test2", file: "/file.js", nesting: 0 };
      tracker.startTest(test2Data);

      // Complete first test
      tracker.completeTest({ ...test1Data, duration_ms: 5 }, { passed: true });

      // Only test2 should be incomplete
      const incomplete = tracker.getIncompleteTests();
      assert.equal(incomplete.length, 1);
      assert.equal(incomplete[0].name, "test2");
    });

    it("should return multiple incomplete tests sorted oldest first", async () => {
      const tracker = new StateTracker();

      // Start tests with delays
      tracker.startTest({ name: "oldest", file: "/file.js", nesting: 0 });
      await new Promise((r) => setTimeout(r, 20));
      tracker.startTest({ name: "middle", file: "/file.js", nesting: 0 });
      await new Promise((r) => setTimeout(r, 20));
      tracker.startTest({ name: "newest", file: "/file.js", nesting: 0 });

      const incomplete = tracker.getIncompleteTests();
      assert.equal(incomplete.length, 3);
      assert.equal(incomplete[0].name, "oldest");
      assert.equal(incomplete[1].name, "middle");
      assert.equal(incomplete[2].name, "newest");
    });
  });

  describe("getSlowTests", () => {
    it("should return empty when no tests completed", () => {
      const tracker = new StateTracker();
      const slow = tracker.getSlowTests();
      assert.equal(slow.length, 0);
    });

    it("should return tests sorted by duration", () => {
      const tracker = new StateTracker();

      // Add tests in reverse order of duration
      tracker.startTest({ name: "fast", file: "/file.js", nesting: 0 });
      tracker.completeTest(
        { name: "fast", file: "/file.js", nesting: 0, duration_ms: 10 },
        { passed: true }
      );

      tracker.startTest({ name: "slow", file: "/file.js", nesting: 0 });
      tracker.completeTest(
        { name: "slow", file: "/file.js", nesting: 0, duration_ms: 1000 },
        { passed: true }
      );

      tracker.startTest({ name: "medium", file: "/file.js", nesting: 0 });
      tracker.completeTest(
        { name: "medium", file: "/file.js", nesting: 0, duration_ms: 500 },
        { passed: true }
      );

      const slow = tracker.getSlowTests();
      assert.equal(slow.length, 3);
      assert.equal(slow[0].name, "slow");
      assert.equal(slow[1].name, "medium");
      assert.equal(slow[2].name, "fast");
    });

    it("should respect limit parameter", () => {
      const tracker = new StateTracker();

      for (let i = 0; i < 5; i++) {
        tracker.startTest({ name: `test${i}`, file: "/file.js", nesting: 0 });
        tracker.completeTest(
          { name: `test${i}`, file: "/file.js", nesting: 0, duration_ms: i * 100 },
          { passed: true }
        );
      }

      const slow = tracker.getSlowTests(3);
      assert.equal(slow.length, 3);
    });

    it("should skip skipped tests", () => {
      const tracker = new StateTracker();

      tracker.startTest({ name: "skipped", file: "/file.js", nesting: 0 });
      tracker.skipTest({ name: "skipped", file: "/file.js", nesting: 0 });

      tracker.startTest({ name: "completed", file: "/file.js", nesting: 0 });
      tracker.completeTest(
        { name: "completed", file: "/file.js", nesting: 0, duration_ms: 100 },
        { passed: true }
      );

      const slow = tracker.getSlowTests();
      assert.equal(slow.length, 1);
      assert.equal(slow[0].name, "completed");
    });
  });

  describe("getFailedTests", () => {
    it("should return only failed tests", () => {
      const tracker = new StateTracker();

      // Passed test
      tracker.startTest({ name: "passed", file: "/file.js", nesting: 0 });
      tracker.completeTest(
        { name: "passed", file: "/file.js", nesting: 0, duration_ms: 10 },
        { passed: true }
      );

      // Failed test
      tracker.startTest({ name: "failed", file: "/file.js", nesting: 0 });
      tracker.completeTest(
        { name: "failed", file: "/file.js", nesting: 0, duration_ms: 20 },
        { passed: false, error: new Error("fail") }
      );

      // Skipped test
      tracker.startTest({ name: "skipped", file: "/file.js", nesting: 0 });
      tracker.skipTest({ name: "skipped", file: "/file.js", nesting: 0 });

      const failed = tracker.getFailedTests();
      assert.equal(failed.length, 1);
      assert.equal(failed[0].name, "failed");
    });
  });

  describe("skipTest", () => {
    it("should mark existing test as skipped", () => {
      const tracker = new StateTracker();

      tracker.startTest({ name: "test1", file: "/file.js", nesting: 0 });
      const test = tracker.skipTest({ name: "test1", file: "/file.js", nesting: 0 });

      assert.equal(test.completed, true);
      assert.equal(test.skipped, true);
      assert.equal(test.passed, false);
    });

    it("should create and skip test if not started", () => {
      const tracker = new StateTracker();

      const test = tracker.skipTest({ name: "test1", file: "/file.js", nesting: 0 });

      assert.equal(test.name, "test1");
      assert.equal(test.skipped, true);
      assert.equal(test.completed, true);
    });

    it("should update skip statistics", () => {
      const tracker = new StateTracker();

      tracker.skipTest({ name: "test1", file: "/file.js", nesting: 0 });
      tracker.skipTest({ name: "test2", file: "/file.js", nesting: 0 });

      assert.equal(tracker.stats.skipped, 2);
    });
  });

  describe("nesting hierarchy", () => {
    it("should track parent relationships", () => {
      const tracker = new StateTracker();

      // Parent describe
      const parentData = { name: "parent", file: "/file.js", nesting: 0 };
      const parent = tracker.startTest(parentData);
      tracker.pushNesting(parent);

      // Child test
      const childData = { name: "child", file: "/file.js", nesting: 1 };
      const child = tracker.startTest(childData);

      assert.ok(child.parent);
      assert.equal(child.parent.id, parent.id);
    });

    it("should pop nesting correctly", () => {
      const tracker = new StateTracker();

      // Level 0
      const t0 = tracker.startTest({ name: "root", file: "/file.js", nesting: 0 });
      tracker.pushNesting(t0);

      // Level 1
      const t1 = tracker.startTest({ name: "level1", file: "/file.js", nesting: 1 });
      tracker.pushNesting(t1);

      // New level 1 (should pop t1)
      const t2 = tracker.startTest({ name: "level1b", file: "/file.js", nesting: 1 });
      tracker.pushNesting(t2);

      // The last item in stack should be t2
      assert.equal(tracker.nestingStack.length, 2);
      assert.equal(tracker.nestingStack[1].name, "level1b");
    });
  });

  describe("getFullTestName", () => {
    it("should build full name with hierarchy", () => {
      const tracker = new StateTracker();

      // Parent
      const parentData = { name: "Parent", file: "/file.js", nesting: 0 };
      const parent = tracker.startTest(parentData);
      tracker.pushNesting(parent);

      // Child
      const childData = { name: "should do something", file: "/file.js", nesting: 1 };
      const child = tracker.startTest(childData);

      const fullName = tracker.getFullTestName(child);
      assert.deepEqual(fullName, ["Parent", "should do something"]);
    });

    it("should handle deep nesting", () => {
      const tracker = new StateTracker();

      const l0 = tracker.startTest({ name: "Root", file: "/file.js", nesting: 0 });
      tracker.pushNesting(l0);

      const l1 = tracker.startTest({ name: "Level1", file: "/file.js", nesting: 1 });
      tracker.pushNesting(l1);

      const l2 = tracker.startTest({ name: "Level2", file: "/file.js", nesting: 2 });
      tracker.pushNesting(l2);

      const test = tracker.startTest({ name: "actual test", file: "/file.js", nesting: 3 });

      const fullName = tracker.getFullTestName(test);
      assert.deepEqual(fullName, ["Root", "Level1", "Level2", "actual test"]);
    });
  });

  describe("getRunningByFile", () => {
    it("should return running tests grouped by file", () => {
      const tracker = new StateTracker();

      tracker.startTest({ name: "t1", file: "/a.js", nesting: 0 });
      tracker.startTest({ name: "t2", file: "/a.js", nesting: 0 });
      tracker.startTest({ name: "t3", file: "/b.js", nesting: 0 });

      const running = tracker.getRunningByFile();
      assert.equal(running.get("/a.js").length, 2);
      assert.equal(running.get("/b.js").length, 1);
    });

    it("should exclude completed tests", () => {
      const tracker = new StateTracker();

      tracker.startTest({ name: "running", file: "/file.js", nesting: 0 });
      tracker.startTest({ name: "completed", file: "/file.js", nesting: 0 });
      tracker.completeTest(
        { name: "completed", file: "/file.js", nesting: 0, duration_ms: 10 },
        { passed: true }
      );

      const running = tracker.getRunningByFile();
      assert.equal(running.get("/file.js").length, 1);
      assert.equal(running.get("/file.js")[0].name, "running");
    });
  });

  describe("getStats", () => {
    it("should return current statistics", () => {
      const tracker = new StateTracker();

      tracker.startTest({ name: "t1", file: "/file.js", nesting: 0 });
      tracker.completeTest({ name: "t1", file: "/file.js", nesting: 0, duration_ms: 10 }, { passed: true });

      tracker.startTest({ name: "t2", file: "/file.js", nesting: 0 });
      // t2 is incomplete

      const stats = tracker.getStats();
      assert.equal(stats.totalTests, 2);
      assert.equal(stats.passed, 1);
      assert.equal(stats.incomplete, 1);
      assert.ok(stats.totalDuration >= 0);
    });
  });
});
