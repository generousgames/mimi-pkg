/**
 * Tests for src/utils/exec.ts.
 *
 * ensureTool is a regression guard for the Node 20 bug that motivated 0.0.12:
 * the old `node -e "process.exit(<boolean>)"` tool check threw
 * ERR_INVALID_ARG_TYPE on Node >= 20, falsely reporting every tool as missing.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ensureTool, run } from "../src/utils/exec";

describe("ensureTool", () => {
    it("resolves for a tool that exists on PATH (node)", async () => {
        await assert.doesNotReject(() => ensureTool("node"));
    });

    it("throws 'Missing required tool' for a tool that does not exist", async () => {
        await assert.rejects(
            () => ensureTool("definitely-not-a-real-tool-xyz123"),
            /Missing required tool: definitely-not-a-real-tool-xyz123/
        );
    });
});

describe("run", () => {
    it("returns the exit code 0 on success", async () => {
        const code = await run("node", ["-e", "process.exit(0)"], { printCmd: false });
        assert.equal(code, 0);
    });

    it("returns a non-zero exit code when allowFail is set", async () => {
        const code = await run("node", ["-e", "process.exit(7)"], { allowFail: true, printCmd: false });
        assert.equal(code, 7);
    });

    it("throws on a non-zero exit code by default", async () => {
        await assert.rejects(
            () => run("node", ["-e", "process.exit(7)"], { printCmd: false }),
            /exited with 7/
        );
    });
});
