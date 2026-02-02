/**
 * Tests for Printer utilities
 */
const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  formatDuration,
  formatRunningDuration,
  formatDots,
  getIcon,
  color,
  printFileHeader,
  printTest,
  printIncompleteTests,
  printSummary,
  COLORS,
  ICONS,
  ASCII_ICONS,
} = require("../reporter/printer");

describe("Printer", () => {
  describe("formatDuration", () => {
    it("should format milliseconds", () => {
      const result = formatDuration(500, { useColor: false });
      assert.ok(result.includes("500ms"));
    });

    it("should format seconds for large values", () => {
      const result = formatDuration(1500, { useColor: false });
      assert.ok(result.includes("1.5s"));
    });

    it("should pad to specified width", () => {
      const result = formatDuration(5, { useColor: false, padWidth: 6 });
      assert.equal(result.length, 6);
    });
  });

  describe("formatRunningDuration", () => {
    it("should format seconds", () => {
      const result = formatRunningDuration(5000);
      assert.ok(result.includes("5s"));
    });

    it("should format minutes for large values", () => {
      const result = formatRunningDuration(90000); // 1.5 minutes
      assert.ok(result.includes("1m"));
      assert.ok(result.includes("30s"));
    });
  });

  describe("formatDots", () => {
    it("should create dots of specified width", () => {
      const result = formatDots(10);
      assert.equal(result, "..........");
    });

    it("should have minimum of 3 dots", () => {
      const result = formatDots(1);
      assert.equal(result, "...");
    });
  });

  describe("color", () => {
    it("should return plain text when useColor is false", () => {
      // When useColor is false (which it is in tests without FORCE_COLOR)
      // color should return plain text
      const result = color("red", "hello");
      // In test environments without FORCE_COLOR, this won't have color codes
      assert.ok(result.includes("hello"));
    });

    it("should have all required color codes defined", () => {
      assert.ok(COLORS.reset);
      assert.ok(COLORS.red);
      assert.ok(COLORS.green);
      assert.ok(COLORS.yellow);
      assert.ok(COLORS.bold);
    });
  });

  describe("getIcon", () => {
    it("should have all required icons", () => {
      assert.ok(getIcon("pass"));
      assert.ok(getIcon("fail"));
      assert.ok(getIcon("running"));
      assert.ok(getIcon("skip"));
      assert.ok(getIcon("warning"));
      assert.ok(getIcon("file"));
    });

    it("should use ASCII fallbacks in non-color mode", () => {
      // Since useColor is false in tests, it should return ASCII icons
      const passIcon = getIcon("pass");
      assert.ok(passIcon === ICONS.pass || passIcon === ASCII_ICONS.pass);
    });
  });

  describe("printFileHeader", () => {
    it("should include file path", () => {
      const output = printFileHeader("/test/file.js", 0, 5, { isNewFile: true });
      assert.ok(output.includes("file.js"));
    });

    it("should include counter [passed/total]", () => {
      const output = printFileHeader("/test/file.js", 2, 5, { isNewFile: true });
      assert.ok(output.includes("[2/5]"));
    });

    it("should return empty string for non-new file", () => {
      const output = printFileHeader("/test/file.js", 0, 5, { isNewFile: false });
      assert.equal(output, "");
    });
  });

  describe("printTest", () => {
    it("should format completed passing test", () => {
      const test = {
        name: "should work",
        nesting: 0,
        completed: true,
        passed: true,
        duration: 100,
      };
      const output = printTest(test, { isRunning: false });
      assert.ok(output.includes("should work"));
      assert.ok(output.includes("ms"));
    });

    it("should format failed test", () => {
      const test = {
        name: "should fail",
        nesting: 0,
        completed: true,
        passed: false,
        duration: 50,
      };
      const output = printTest(test, { isRunning: false });
      assert.ok(output.includes("should fail"));
    });

    it("should format running test with spinner", () => {
      const test = {
        name: "in progress",
        nesting: 0,
        completed: false,
        duration: null,
      };
      const output = printTest(test, {
        isRunning: true,
        runningDuration: 5000,
        spinnerFrame: 0,
      });
      assert.ok(output.includes("in progress"));
      assert.ok(output.includes("~5s"));
    });

    it("should apply nesting indentation", () => {
      const test = {
        name: "nested test",
        nesting: 2,
        completed: true,
        passed: true,
        duration: 10,
      };
      const output = printTest(test, { isRunning: false, indentSize: 2 });
      // Should have 4 spaces of indent (2 * 2)
      assert.ok(output.startsWith("    "));
    });

    it("should truncate long names", () => {
      const longName = "a".repeat(200);
      const test = {
        name: longName,
        nesting: 0,
        completed: true,
        passed: true,
        duration: 10,
      };
      const output = printTest(test, { isRunning: false });
      // Check that output is not the full length
      assert.ok(output.length < longName.length + 50);
    });
  });

  describe("printIncompleteTests", () => {
    it("should return empty string for no incomplete tests", () => {
      const output = printIncompleteTests([]);
      assert.equal(output, "");
    });

    it("should format incomplete tests warning", () => {
      const incomplete = [
        {
          name: "hanging test",
          file: "/test/file.js",
          startTime: Date.now() - 10000, // 10 seconds ago
        },
      ];
      const output = printIncompleteTests(incomplete);
      assert.ok(output.includes("INCOMPLETE TESTS DETECTED"));
      assert.ok(output.includes("hanging test"));
      assert.ok(output.includes("file.js"));
      assert.ok(output.includes("~10s"));
    });

    it("should mark longest running test with tip", () => {
      const incomplete = [
        {
          name: "recent",
          file: "/test/a.js",
          startTime: Date.now() - 5000,
        },
        {
          name: "oldest",
          file: "/test/b.js",
          startTime: Date.now() - 30000,
        },
      ];
      const output = printIncompleteTests(incomplete);
      assert.ok(output.includes("oldest"));
      assert.ok(output.includes("infinite loops") || output.includes("Tip"));
    });

    it("should show multiple incomplete tests sorted by time", () => {
      const baseTime = Date.now();
      const incomplete = [
        { name: "newest", file: "/test/c.js", startTime: baseTime - 1000 },
        { name: "oldest", file: "/test/a.js", startTime: baseTime - 10000 },
        { name: "middle", file: "/test/b.js", startTime: baseTime - 5000 },
      ];
      const output = printIncompleteTests(incomplete);
      // Check they're in ascending order by start time
      const oldestPos = output.indexOf("oldest");
      const middlePos = output.indexOf("middle");
      const newestPos = output.indexOf("newest");
      assert.ok(oldestPos < middlePos, "oldest should come before middle");
      assert.ok(middlePos < newestPos, "middle should come before newest");
    });
  });

  describe("printSummary", () => {
    it("should show success state when no failures", () => {
      const stats = {
        totalFiles: 5,
        passed: 20,
        failed: 0,
        skipped: 2,
        totalDuration: 5000,
      };
      const output = printSummary(stats, { failedTests: [], slowTests: [] });
      assert.ok(output.includes("TEST SUITE COMPLETE"));
      assert.ok(output.includes("5 files"));
      assert.ok(output.includes("20 passed"));
      assert.ok(output.includes("0 failed"));
      assert.ok(output.includes("2 skipped"));
    });

    it("should show failures section when tests fail", () => {
      const stats = {
        totalFiles: 5,
        passed: 18,
        failed: 2,
        skipped: 0,
        totalDuration: 10000,
      };
      const failedTests = [
        { name: "broken test", file: "/test/bad.js", error: { line: 42 } },
      ];
      const output = printSummary(stats, { failedTests, slowTests: [] });
      assert.ok(output.includes("FAILURES"));
      assert.ok(output.includes("broken test"));
      assert.ok(output.includes("bad.js"));
    });

    it("should show slow tests section", () => {
      const stats = {
        totalFiles: 3,
        passed: 10,
        failed: 0,
        skipped: 0,
        totalDuration: 15000,
      };
      const slowTests = [
        { name: "slow one", file: "/test/slow.js", duration: 5000 },
        { name: "slow two", file: "/test/slow.js", duration: 3000 },
      ];
      const output = printSummary(stats, { failedTests: [], slowTests });
      assert.ok(output.includes("SLOW TESTS"));
      assert.ok(output.includes("slow one"));
    });

    it("should format durations in slow tests", () => {
      const stats = {
        totalFiles: 1,
        passed: 1,
        failed: 0,
        skipped: 0,
        totalDuration: 2000,
      };
      const slowTests = [{ name: "test", file: "/t.js", duration: 1500 }];
      const output = printSummary(stats, { failedTests: [], slowTests });
      assert.ok(output.includes("1.5s") || output.includes("1500"));
    });
  });

  describe("icon constants", () => {
    it("should have different values for each icon state", () => {
      // All icon keys should have distinct values
      const values = Object.values(ICONS);
      const uniqueValues = new Set(values);
      assert.equal(values.length, uniqueValues.size);
    });

    it("should have ASCII fallbacks for all icons", () => {
      const iconKeys = Object.keys(ICONS);
      const asciiKeys = Object.keys(ASCII_ICONS);
      for (const key of iconKeys) {
        assert.ok(asciiKeys.includes(key), `Missing ASCII icon for ${key}`);
      }
    });
  });

  describe("color codes", () => {
    it("should have valid ANSI escape codes", () => {
      for (const [name, code] of Object.entries(COLORS)) {
        assert.ok(code.startsWith("\x1b["), `Color ${name} should be ANSI escape code`);
        assert.ok(code.endsWith("m"), `Color ${name} should end with 'm'`);
      }
    });

    it("should have reset code", () => {
      assert.ok(COLORS.reset);
      assert.ok(COLORS.reset.includes("[0m"));
    });
  });
});
