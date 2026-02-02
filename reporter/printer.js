/**
 * Printer - Pretty formatting utilities for test output
 */

const { EOL } = require("os");

// Environment detection
const isTTY =
  process.stdout.isTTY &&
  !process.env.CI &&
  process.env.NODE_ENV !== "test";
const FORCE_COLOR =
  process.env.FORCE_COLOR === "1" || process.env.FORCE_COLOR === "2";
const NO_COLOR = process.env.NO_COLOR !== undefined;
const useColor = (isTTY || FORCE_COLOR) && !NO_COLOR;

// Unicode-friendly status icons
const ICONS = {
  pass: "✓",
  fail: "✗",
  running: "⏳",
  skip: "⊘",
  warning: "⚠️ ",
  file: "📄",
  dot: "\u00B7", // middle dot for spinner
};

// Non-TTY fallbacks
const ASCII_ICONS = {
  pass: "[OK]",
  fail: "[FAIL]",
  running: "[...]",
  skip: "[SKIP]",
  warning: "[!]",
  file: "FILE:",
  dot: ".",
};

// ANSI color codes
const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  orange: "\x1b[38;5;208m",
  gray: "\x1b[90m",
};

function color(code, text) {
  return useColor ? `${COLORS[code]}${text}${COLORS.reset}` : text;
}

function getIcon(name) {
  return useColor ? ICONS[name] : ASCII_ICONS[name];
}

/**
 * Format duration with appropriate unit and color
 */
function formatDuration(ms, options = {}) {
  const { useColor: colorize = true, padWidth = 6 } = options;

  let value, unit;
  if (ms < 1000) {
    value = Math.round(ms);
    unit = "ms";
  } else {
    value = (ms / 1000).toFixed(1);
    unit = "s";
  }

  const formatted = `${value}${unit}`.padStart(padWidth);

  if (!colorize || !useColor) return formatted;

  // Color based on duration
  if (ms < 100) return color("green", formatted);
  if (ms < 1000) return color("yellow", formatted);
  return color("orange", formatted);
}

/**
 * Format a running duration (approximate)
 */
function formatRunningDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `~${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `~${minutes}m ${remainingSeconds}s`;
}

/**
 * Create a spinner animation frame (for live updates)
 */
function getSpinner(frame) {
  if (!useColor) return "";
  const spinners = ["    ", "•   ", " •  ", "  • ", "   •", "  • ", " •  ", "•   "];
  return color("cyan", spinners[frame % spinners.length]);
}

/**
 * Format dotted connector that gracefully truncates
 */
function formatDots(width) {
  const maxDots = Math.max(3, width);
  return ".".repeat(maxDots);
}

/**
 * Print file header
 */
function printFileHeader(filePath, passed, total, options = {}) {
  const { isNewFile = true } = options;
  const icons = getIcon("file");
  const counter = color("dim", `[${passed}/${total}]`);
  const relativePath = filePath.replace(process.cwd(), "").replace(/^\//, "");

  if (isNewFile) {
    return `${EOL}${icons} ${color("bold", relativePath)} ${counter}${EOL}`;
  }
  return "";
}

/**
 * Print test line with nesting
 */
function printTest(test, options = {}) {
  const { isRunning = false, spinnerFrame = 0, indentSize = 2 } = options;

  const indent = " ".repeat(test.nesting * indentSize);
  const icons = isRunning ? getIcon("running") : test.passed ? getIcon("pass") : getIcon("fail");

  let duration;
  if (isRunning) {
    duration = color("dim", formatRunningDuration(options.runningDuration || 0));
  } else if (test.duration !== null) {
    duration = formatDuration(test.duration, { useColor });
  } else {
    duration = color("dim", "    -");
  }

  const spinner = isRunning ? getSpinner(spinnerFrame) : "";

  // Format the test name - truncate if too long
  const terminalWidth = process.stdout.columns || 80;
  const reservedSpace = 20; // for duration, spinner, etc
  const maxNameLength = Math.max(20, terminalWidth - reservedSpace - indent.length - 4);

  let displayName = test.name;
  if (displayName.length > maxNameLength) {
    displayName = displayName.slice(0, maxNameLength - 3) + "...";
  }

  // Dotted connector
  const dotsWidth = Math.max(3, terminalWidth - indent.length - displayName.length - 12);
  const dots = color("dim", formatDots(dotsWidth));

  return `${indent}${icons} ${displayName} ${dots} ${duration}${spinner}${EOL}`;
}

/**
 * Print skipped test
 */
function printSkippedTest(test, options = {}) {
  const { indentSize = 2 } = options;
  const indent = " ".repeat(test.nesting * indentSize);
  const icons = getIcon("skip");
  return `${indent}${icons} ${color("gray", test.name + " [skipped]")}${EOL}`;
}

/**
 * Print error details
 */
function printError(test, options = {}) {
  const { indentSize = 2 } = options;
  if (!test.error) return "";

  const indent = " ".repeat((test.nesting + 1) * indentSize);
  const errorMessage = test.error.message || String(test.error);

  // Try to extract stack trace
  let stack = "";
  if (test.error.stack) {
    const lines = test.error.stack.split("\n");
    // Find first line from project code (not node_modules)
    for (const line of lines.slice(1)) {
      if (line.includes("node_modules")) continue;
      const match = line.match(/at .* \((.*):(\d+):(\d+)\)/);
      if (match) {
        const [, file, lineNum, col] = match;
        const relativeFile = file.replace(process.cwd(), "").replace(/^\//, "");
        stack = `${indent}at ${relativeFile}:${lineNum}:${col}${EOL}`;
        break;
      }
    }
  }

  return `${EOL}${indent}${color("red", errorMessage)}${EOL}${stack}`;
}

/**
 * Print incomplete tests warning (critical feature for stuck test detection)
 */
function printIncompleteTests(incompleteTests, options = {}) {
  if (incompleteTests.length === 0) return "";

  // Sort by start time ascending (oldest first, longest running at bottom)
  const sortedTests = [...incompleteTests].sort((a, b) => a.startTime - b.startTime);

  const output = [];
  output.push(EOL);
  output.push(color("red", `${getIcon("warning")}  INCOMPLETE TESTS DETECTED${EOL}`));
  output.push(EOL);
  output.push(color("dim", "These tests started but never completed. The test at the bottom ran longest"));
  output.push(color("dim", "and is most likely the one blocking:"));
  output.push(EOL);

  const now = Date.now();

  sortedTests.forEach((test, index) => {
    const duration = now - test.startTime;
    const durationStr = formatRunningDuration(duration);
    const isLongest = index === incompleteTests.length - 1;

    const filePath = test.file ? test.file.replace(process.cwd(), "").replace(/^\//, "") : "unknown";
    const indent = "  ";

    output.push(`${indent}${getIcon("running")} ${color("bold", filePath)}${EOL}`);
    output.push(`${indent}   ${color("dim", "└─")} ${test.name} (${color("orange", durationStr)})${EOL}`);

    if (isLongest) {
      output.push(EOL);
      output.push(`${indent}${color("cyan", "💡 Tip: Check for: infinite loops, blocking sync calls,")}${EOL}`);
      output.push(`${indent}${color("cyan", "   unawaited async, database deadlocks, or hanging network requests")}${EOL}`);
    }
  });

  return output.join("");
}

/**
 * Print non-TTY incomplete tests report
 */
function printNonTTYIncompleteTests(incompleteTests, options = {}) {
  if (incompleteTests.length === 0) return "";

  // Sort by start time ascending (oldest first, longest running at bottom)
  const sortedTests = [...incompleteTests].sort((a, b) => a.startTime - b.startTime);

  const output = [];
  output.push(EOL);
  output.push("### PROCESS INTERRUPTED - INCOMPLETE TESTS");
  output.push(EOL);
  output.push("The following tests started but never completed:");
  output.push("  (Ordered by start time - the last one likely caused the hang)");
  output.push(EOL);

  const now = Date.now();

  sortedTests.forEach((test, index) => {
    const duration = Math.floor((now - test.startTime) / 1000);
    const durationStr = `[${duration.toString().padStart(2)}s]`;
    const isLongest = index === incompleteTests.length - 1;
    const filePath = test.file ? test.file.replace(process.cwd(), "").replace(/^\//, "") : "unknown";

    let line = `  ${durationStr}  ${filePath}::${test.name}`;
    if (isLongest) line += " <-- LONGEST";
    output.push(line);
  });

  return output.join(EOL) + EOL;
}

/**
 * Print final summary
 */
function printSummary(stats, options = {}) {
  const { failedTests = [], slowTests = [] } = options;
  const output = [];

  output.push(EOL);

  // Header
  const statusColor = stats.failed > 0 ? "red" : "green";
  const header = `${getIcon(stats.failed > 0 ? "fail" : "pass")} TEST SUITE COMPLETE${useColor ? "" : " ---"} ${stats.totalFiles} files | ${stats.passed} passed | ${stats.failed} failed | ${stats.skipped} skipped | ${formatDuration(stats.totalDuration, { useColor: false, padWidth: 0 })}`;
  output.push(color(statusColor, header));
  output.push(EOL);

  // Failed tests section
  if (failedTests.length > 0) {
    output.push(EOL);
    output.push(color("red", `${getIcon("fail")} FAILURES (${failedTests.length}):`));
    output.push(EOL);

    failedTests.forEach((test, index) => {
      const filePath = test.file ? test.file.replace(process.cwd(), "").replace(/^\//, "") : "unknown";
      const line = test.error?.line || "?";
      output.push(`  ${index + 1}. ${filePath}:${line} ${color("dim", "—")} ${test.name}${EOL}`);
    });
  }

  // Slow tests section
  if (slowTests.length > 0) {
    output.push(EOL);
    output.push(color("yellow", `${getIcon("warning")} SLOW TESTS (potential flaky tests):`));
    output.push(EOL);

    slowTests.forEach((test) => {
      const filePath = test.file ? test.file.replace(process.cwd(), "").replace(/^\//, "") : "unknown";
      const fullName = test.parent ? `${test.parent.name} ${color("dim", "›")} ${test.name}` : test.name;
      output.push(`     ${formatDuration(test.duration, { useColor })}  ${filePath} ${color("dim", "—")} ${fullName}${EOL}`);
    });
  }

  return output.join("");
}

/**
 * Print non-TTY summary
 */
function printNonTTYSummary(stats, options = {}) {
  const { failedTests = [], slowTests = [] } = options;
  const output = [];

  output.push(EOL);
  output.push(`TEST SUITE COMPLETE --- ${stats.totalFiles} files | ${stats.passed} passed | ${stats.failed} failed | ${stats.skipped} skipped | ${formatDuration(stats.totalDuration, { useColor: false, padWidth: 0 })}`);

  if (failedTests.length > 0) {
    output.push(EOL);
    output.push("FAILED TESTS:");
    failedTests.forEach((test, index) => {
      const filePath = test.file ? test.file.replace(process.cwd(), "").replace(/^\//, "") : "unknown";
      const line = test.error?.line || "?";
      output.push(`  ${index + 1}. ${filePath}:${line} — ${test.name}`);
    });
  }

  if (slowTests.length > 0) {
    output.push(EOL);
    output.push("SLOW TESTS (potential flaky tests):");
    slowTests.forEach((test) => {
      const filePath = test.file ? test.file.replace(process.cwd(), "").replace(/^\//, "") : "unknown";
      const parentName = test.parent ? `${test.parent.name} > ` : "";
      output.push(`     ${formatDuration(test.duration, { useColor: false, padWidth: 6 })}  ${filePath} — ${parentName}${test.name}`);
    });
  }

  if (stats.failed > 0) {
    output.push(EOL);
    output.push(`Exit code: 1 (failure)`);
  }

  return output.join(EOL) + EOL;
}

/**
 * Clear line for live updates (TTY only)
 */
function clearLine() {
  if (isTTY && useColor) {
    process.stdout.write("\r\x1b[K");
  }
}

/**
 * Move cursor up (TTY only)
 */
function cursorUp(lines = 1) {
  if (isTTY && useColor) {
    process.stdout.write(`\x1b[${lines}A`);
  }
}

module.exports = {
  isTTY,
  useColor,
  color,
  getIcon,
  formatDuration,
  formatRunningDuration,
  getSpinner,
  formatDots,
  printFileHeader,
  printTest,
  printSkippedTest,
  printError,
  printIncompleteTests,
  printNonTTYIncompleteTests,
  printSummary,
  printNonTTYSummary,
  clearLine,
  cursorUp,
  COLORS,
  ICONS,
  ASCII_ICONS,
};
