/**
 * State Tracker - Manages running test state for detecting stuck/incomplete tests
 */

class StateTracker {
  constructor() {
    // Map of test IDs to test info: { id, name, file, nesting, parent, startTime, completed, error }
    this.tests = new Map();
    // Map of file paths to file info: { path, tests, completedTests, failedTests, skippedTests }
    this.files = new Map();
    // Track currently running tests by file
    this.runningByFile = new Map();
    // Overall statistics
    this.stats = {
      totalFiles: 0,
      completedFiles: 0,
      totalTests: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      startTime: Date.now(),
    };
    // Track nesting context for building test hierarchy
    this.nestingStack = [];
  }

  /**
   * Start tracking a test
   */
  startTest(data) {
    const id = this.getTestId(data);
    const testInfo = {
      id,
      name: data.name,
      file: data.file,
      nesting: data.nesting,
      parent: this.getCurrentParent(data.nesting),
      startTime: Date.now(),
      completed: false,
      passed: null,
      skipped: false,
      duration: null,
      error: null,
    };

    this.tests.set(id, testInfo);
    this.stats.totalTests++;

    // Track by file
    if (data.file) {
      if (!this.files.has(data.file)) {
        this.files.set(data.file, {
          path: data.file,
          tests: [],
          completedTests: 0,
          failedTests: 0,
          skippedTests: 0,
        });
        this.stats.totalFiles++;
      }
      this.files.get(data.file).tests.push(testInfo);

      // Track running tests
      if (!this.runningByFile.has(data.file)) {
        this.runningByFile.set(data.file, new Set());
      }
      this.runningByFile.get(data.file).add(id);
    }

    return testInfo;
  }

  /**
   * Mark a test as completed (pass, fail, or skip)
   */
  completeTest(data, result) {
    const id = this.getTestId(data);
    const test = this.tests.get(id);

    if (!test) return null;

    test.completed = true;
    test.passed = result.passed;
    test.skipped = result.skipped || false;
    test.duration = data.duration_ms || (Date.now() - test.startTime);
    test.error = result.error || null;
    test.endTime = Date.now();

    // Update file stats
    if (test.file) {
      const fileInfo = this.files.get(test.file);
      if (fileInfo) {
        fileInfo.completedTests++;
        if (test.passed) {
          this.stats.passed++;
        } else if (test.skipped) {
          fileInfo.skippedTests++;
          this.stats.skipped++;
        } else {
          fileInfo.failedTests++;
          this.stats.failed++;
        }

        // Check if file is complete (all tests done)
        if (fileInfo.completedTests === fileInfo.tests.length) {
          this.stats.completedFiles++;
        }
      }

      // Remove from running
      const running = this.runningByFile.get(test.file);
      if (running) {
        running.delete(id);
      }
    }

    return test;
  }

  /**
   * Mark a test as skipped (special handling for skip events)
   */
  skipTest(data) {
    const id = this.getTestId(data);
    let test = this.tests.get(id);

    if (!test) {
      // Create test info if it wasn't started (skipped before start)
      test = this.startTest(data);
    }

    return this.completeTest(data, { passed: false, skipped: true });
  }

  /**
   * Get all incomplete tests (started but never completed)
   * Sorted by start time (oldest first, so longest running at bottom)
   */
  getIncompleteTests() {
    const incomplete = [];
    for (const test of this.tests.values()) {
      if (!test.completed) {
        incomplete.push(test);
      }
    }
    // Sort by start time ascending (oldest = longest running = most likely stuck)
    return incomplete.sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * Get current running tests grouped by file
   */
  getRunningByFile() {
    const result = new Map();
    for (const [filePath, testIds] of this.runningByFile.entries()) {
      const tests = [];
      for (const id of testIds) {
        const test = this.tests.get(id);
        if (test && !test.completed) {
          tests.push(test);
        }
      }
      if (tests.length > 0) {
        result.set(filePath, tests);
      }
    }
    return result;
  }

  /**
   * Get running duration for a test
   */
  getRunningDuration(test) {
    return Date.now() - test.startTime;
  }

  /**
   * Get final statistics
   */
  getStats() {
    return {
      ...this.stats,
      totalDuration: Date.now() - this.stats.startTime,
      incomplete: this.getIncompleteTests().length,
    };
  }

  /**
   * Get slowest completed tests
   */
  getSlowTests(limit = 10) {
    const completed = [];
    for (const test of this.tests.values()) {
      if (test.completed && test.duration !== null && !test.skipped) {
        completed.push(test);
      }
    }
    return completed
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  /**
   * Get all failed tests
   */
  getFailedTests() {
    const failed = [];
    for (const test of this.tests.values()) {
      if (test.completed && !test.passed && !test.skipped) {
        failed.push(test);
      }
    }
    return failed;
  }

  /**
   * Get tests organized by file
   */
  getTestsByFile() {
    const result = new Map();
    for (const [filePath, fileInfo] of this.files.entries()) {
      result.set(filePath, fileInfo.tests);
    }
    return result;
  }

  /**
   * Generate a unique ID for a test based on its identifying data
   */
  getTestId(data) {
    // Use file + name + nesting as unique identifier
    return `${data.file || 'unknown'}::${data.nesting}::${data.name}`;
  }

  /**
   * Get the parent test at the given nesting level
   */
  getCurrentParent(nesting) {
    if (nesting === 0) return null;
    // Find the most recent test at nesting - 1
    for (let i = this.nestingStack.length - 1; i >= 0; i--) {
      if (this.nestingStack[i].nesting === nesting - 1) {
        return this.nestingStack[i];
      }
    }
    return null;
  }

  /**
   * Update nesting context when a test starts
   */
  pushNesting(testInfo) {
    // Remove any items at same or deeper nesting
    while (
      this.nestingStack.length > 0 &&
      this.nestingStack[this.nestingStack.length - 1].nesting >= testInfo.nesting
    ) {
      this.nestingStack.pop();
    }
    this.nestingStack.push(testInfo);
  }

  /**
   * Build full test name with parent hierarchy
   */
  getFullTestName(test) {
    const parts = [];
    let current = test;
    while (current) {
      parts.unshift(current.name);
      current = current.parent ? this.tests.get(current.parent.id) : null;
    }
    return parts;
  }

  /**
   * Get file completion status [passed, total]
   */
  getFileStatus(filePath) {
    const fileInfo = this.files.get(filePath);
    if (!fileInfo) return [0, 0];
    const passed = fileInfo.tests.filter((t) => t.completed && t.passed).length;
    return [passed, fileInfo.tests.length];
  }
}

module.exports = { StateTracker };
