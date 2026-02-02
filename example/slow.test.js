/**
 * Tests that take varying amounts of time
 * to demonstrate duration formatting and slow test detection
 */
const { describe, it } = require("node:test");
const assert = require("node:assert");

/**
 * Example: Very fast test (< 100ms = green in TTY)
 */
it("ultra fast test", async () => {
  // Almost instant
  assert.ok(true);
});

/**
 * Example: Fast test (100ms - 1s = yellow in TTY)
 */
it("fast test", async () => {
  await new Promise((r) => setTimeout(r, 150));
  assert.ok(true);
});

/**
 * Example: Slow test (> 1s = orange in TTY)
 * This will appear in the "slow tests" section
 */
it("slow test", async () => {
  await new Promise((r) => setTimeout(r, 1200));
  assert.ok(true);
});

/**
 * Example: Very slow test (will trigger slow test warning)
 */
it("very slow test", async () => {
  await new Promise((r) => setTimeout(r, 1500));
  assert.ok(true);
});
