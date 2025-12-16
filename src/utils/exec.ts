import { $, ProcessOutput } from "zx";
import { log } from "./log.js";

$.verbose = false;     // set true while debugging
$.nothrow = true;     // we handle exit codes ourselves

export async function run(cmd: string, args: (string | number)[], opts?: {
  cwd?: string; env?: NodeJS.ProcessEnv;
  allowFail?: boolean; printCmd?: boolean;
  verbose?: boolean;
}): Promise<number> {
  const { cwd, env, allowFail = false, printCmd = true, verbose = false } = opts ?? {};
  const line = [cmd, ...args.map(String)].join(" ");
  if (printCmd) log.cmd(line);

  $.verbose = verbose;

  const p = $({ cwd, env })`${cmd} ${args}`;
  const out: ProcessOutput = await p;

  if (!allowFail && out.exitCode !== 0) {
    throw new Error(`${cmd} exited with ${out.exitCode}`);
  }
  return out.exitCode ?? 0;
}

export async function ensureTool(name: string): Promise<void> {
  const which = await $`node -e "process.exit(!Boolean(require('node:child_process').spawnSync(process.platform==='win32'?'where':'which',['${name}'],{stdio:'ignore'}).status===0))"`;
  if (which.exitCode !== 0) throw new Error(`Missing required tool: ${name}`);
}