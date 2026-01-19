#!/usr/bin/env node
/* eslint-disable no-console */
const { spawn } = require("child_process");
const path = require("path");

const argv = process.argv.slice(2);
const parseArgList = (flagName) => {
  const flag = `--${flagName}`;
  const found = argv.find((arg) => arg === flag);
  const withValue = argv.find((arg) => arg.startsWith(`${flag}=`));
  if (found) {
    const index = argv.indexOf(found);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      return next.split(" ");
    }
    return [];
  }
  if (withValue) {
    return withValue.slice(flag.length + 1).split(" ");
  }
  return [];
};

const mobileExtraArgs = parseArgList("mobile-args");
const androidExtraArgs = parseArgList("android-args");
const webExtraArgs = parseArgList("web-args");

const PACKAGER_PORT = process.env.DEV_ALL_PACKAGER_PORT ?? "8082";

const tasks = [
  {
    name: "api",
    command: "npm",
    args: ["run", "start:dev"],
    cwd: path.join(__dirname, "..", "apps", "api"),
    stdio: "ignore",
  },
  {
    name: "web",
    command: "npm",
    args: ["run", "dev", ...webExtraArgs],
    cwd: path.join(__dirname, "..", "apps", "web"),
    stdio: "ignore",
  },
  {
    name: "mobile-packager",
    command: "npm",
    args: ["run", "start", "--", "--port", PACKAGER_PORT, ...mobileExtraArgs],
    cwd: path.join(__dirname, "..", "apps", "mobile"),
    stdio: "inherit",
  },
];

const mobileAndroidTask = {
  name: "mobile-android",
  command: "npm",
  args: ["run", "android", ...androidExtraArgs],
  cwd: path.join(__dirname, "..", "apps", "mobile"),
  stdio: "ignore",
};

const children = [];
let androidStarted = false;
const androidTriggers = [
  "Logs for your project will appear below",
  "Tunnel ready",
  "Metro Bundler ready",
  "Tunnel ready at",
];

const emojiMap = {
  api: "⚙️",
  web: "🌐",
  "mobile-packager": "📱",
  "mobile-android": "🤖",
};

const webUrlMatch = /Local:\s*(https?:\/\/\S+)/i;
const platformOpenCommand = (platform) => {
  if (platform === "darwin") return "open";
  if (platform === "win32") return "start";
  return "xdg-open";
};

let webOpened = false;

const openBrowser = (url) => {
  if (webOpened || !url) {
    return;
  }
  const opener = platformOpenCommand(process.platform);
  spawn(opener, opener === "start" ? ["", url] : [url], {
    shell: true,
    stdio: "ignore",
  }).on("error", () => {});
  webOpened = true;
};

const prefixOutput = (name, data) => {
  const text = data.toString().replace(/\n+$/g, "");
  text.split("\n").forEach((line) => {
    if (!line.trim()) {
      return;
    }
    if (
      !androidStarted &&
      name === "mobile-packager" &&
      androidTriggers.some((trigger) =>
        line.toLowerCase().includes(trigger.toLowerCase())
      )
    ) {
      androidStarted = true;
      startTask(mobileAndroidTask);
    }
    if (name === "web") {
      const match = line.match(webUrlMatch);
      if (match) {
        openBrowser(match[1]);
      }
    }
    const label = emojiMap[name] ? `${emojiMap[name]} ${name}` : name;
    console.log(`[${label}] ${line}`);
  });
};

function startTask(task) {
  const env = { ...process.env };
  if (task.name === "mobile-android") {
    env.EXPO_PACKAGER_PORT = PACKAGER_PORT;
  }
  const child = spawn(task.command, task.args, {
    cwd: task.cwd,
    env,
    stdio: [task.stdio ?? "inherit", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
  child.stdout.on("data", (data) => prefixOutput(task.name, data));
  child.stderr.on("data", (data) => prefixOutput(task.name, data));
  child.on("error", (error) => {
    console.log(`[${task.name}] error: ${error.message}`);
  });
  child.on("exit", (code, signal) => {
    console.log(
      `[${task.name}] exited with ${signal || `code ${code ?? "unknown"}`}`
    );
  });
  children.push(child);
  if (task.name === "mobile-packager") {
    console.log(
      "[📱 mobile-packager] Expo shortcuts: `r` reload, `R` restart, `d` dev menu, `j` debugger, `m` metro menu"
    );
  }
}

tasks.forEach(startTask);

const terminate = () => {
  children.forEach((child) => {
    if (!child.killed) {
      child.kill("SIGINT");
    }
  });
  process.exit();
};

process.on("SIGINT", terminate);
process.on("SIGTERM", terminate);
