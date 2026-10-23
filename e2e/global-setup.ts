import { execSync } from "node:child_process";

export default function globalSetup() {
  const cmd = process.env.SEED_CMD;
  if (!cmd) {
    console.warn("SEED_CMD not set; running against the current database state.");
    return;
  }
  execSync(cmd, { stdio: "inherit" });
}
