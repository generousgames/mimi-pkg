import { bold, cyan, gray, green, red, yellow } from "colorette";

export const log = {
    info: (...m: unknown[]) => console.log(cyan("ℹ"), ...m),
    ok: (...m: unknown[]) => console.log(green("✔"), ...m),
    warn: (...m: unknown[]) => console.log(yellow("▲"), ...m),
    err: (...m: unknown[]) => console.error(red("✖"), ...m),
    cmd: (s: string) => console.log(gray("$ " + s)),
    head: (s: string) => console.log(bold(cyan(s)))
};