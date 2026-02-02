/**
 * Basic example tests demonstrating the reporter
 */
const { describe, it } = require("node:test");
const assert = require("node:assert");

describe("UserService", () => {
  it("should create user", async () => {
    // Simulate async work
    await new Promise((r) => setTimeout(r, 45));
    assert.equal(1 + 1, 2);
  });

  it("should validate email", async () => {
    await new Promise((r) => setTimeout(r, 12));
    assert.ok("test@example.com".includes("@"));
  });

  /**
   * Example of a test that takes a bit longer
   */
  it("should handle edge cases", async () => {
    await new Promise((r) => setTimeout(r, 100));
    assert.deepStrictEqual([1, 2, 3], [1, 2, 3]);
  });

  /**
   * Example of a failing test to show error output
   */
  it("should delete user - FAILING EXAMPLE", async () => {
    await new Promise((r) => setTimeout(r, 50));
    // Intentionally failing to demonstrate error output
    throw new Error("Expected user to be deleted");
  });
});

describe("GET /users", () => {
  it("returns 200 with user list", async () => {
    await new Promise((r) => setTimeout(r, 23));
    assert.equal(typeof [], "object");
  });
});

describe("POST /users", () => {
  it("creates new user", async () => {
    await new Promise((r) => setTimeout(r, 67));
    assert.ok(true);
  });
});
