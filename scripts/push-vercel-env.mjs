import { spawn } from "node:child_process";
import fs from "node:fs";

const text = fs.readFileSync(".env.local", "utf8");
const entries = [];
for (const line of text.split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!match) continue;
  let value = match[2].trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  if (!value) continue;
  entries.push({ name: match[1], value });
}

const public_entry = entries.find((entry) => entry.name === "PUBLIC_BASE_URL");
if (public_entry) {
  try {
    const url = new URL(public_entry.value);
    console.log(`PUBLIC_HOST=${url.host}`);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      public_entry.value = "https://in-class-pi.vercel.app";
      console.log("PUBLIC_HOST_OVERRIDDEN=in-class-pi.vercel.app");
    }
  } catch {
    public_entry.value = "https://in-class-pi.vercel.app";
    console.log("PUBLIC_HOST_OVERRIDDEN=in-class-pi.vercel.app");
  }
}

function add_env(name, value) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      [
        "vercel@latest",
        "env",
        "add",
        name,
        "--environment",
        "production,preview,development",
        "--yes",
        "--force",
        "--no-sensitive",
      ],
      { shell: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const safe = output
        .split(/\r?\n/)
        .filter((line) => !line.includes(value))
        .join("\n");
      if (code === 0) {
        console.log(`ADDED ${name}`);
        resolve();
        return;
      }
      console.log(`FAIL ${name}`);
      console.log(safe.slice(0, 500));
      reject(new Error(`env add failed for ${name}`));
    });
    child.stdin.write(value);
    child.stdin.end();
  });
}

for (const entry of entries) {
  await add_env(entry.name, entry.value);
}
