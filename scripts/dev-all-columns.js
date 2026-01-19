#!/usr/bin/env node
/* eslint-disable no-console */
const { spawn, spawnSync } = require("child_process");
const path = require("path");
const blessed = require("blessed");

const PORT = process.env.DEV_COL_PORT ?? "8082";
const API_PORT = process.env.DEV_COL_API_PORT ?? "8080";

const ensurePortFree = (port, label = "port-guard") => {
  const normalizedPort = Number(port);
  if (!Number.isFinite(normalizedPort)) {
    return;
  }
  try {
    if (process.platform === "win32") {
      const netstat = spawnSync("netstat", ["-ano"], { encoding: "utf-8" });
      const lines = (netstat.stdout ?? "").split(/\r?\n/);
      const pids = new Set();
      lines.forEach((line) => {
        if (
          !line.includes(`:${normalizedPort}`) ||
          !line.toLowerCase().includes("listening")
        ) {
          return;
        }
        const match = line.match(/\\s+(\\d+)$/);
        if (match) {
          pids.add(match[1]);
        }
      });
      pids.forEach((pid) => {
        spawnSync("taskkill", ["/F", "/PID", pid], { stdio: "ignore" });
      });
    } else {
      const lsof = spawnSync("lsof", ["-ti", `:${normalizedPort}`], {
        encoding: "utf-8",
      });
      (lsof.stdout ?? "")
        .split(/\\r?\\n/)
        .filter(Boolean)
        .forEach((pid) => {
          spawnSync("kill", ["-9", pid], { stdio: "ignore" });
        });
    }
  } catch (error) {
    console.log(
      `[${label}] failed to ensure port ${normalizedPort} is free: ${error.message}`
    );
  }
};

const taskChildren = new Map();
const restartHandlers = new Map();
const restartCounts = new Map();
const restartingTasks = new Set();
const MAX_RESTARTS = 3;

const detectPortConflict = (text) => {
  if (!text) {
    return null;
  }
  const expoMatch = text.match(/port\s+(\d+)\s+is\s+being\s+used/i);
  if (expoMatch) {
    return Number(expoMatch[1]);
  }
  const nodeMatch = text.match(/address\s+already\s+in\s+use(?:.*:)?(\d+)/i);
  if (nodeMatch) {
    return Number(nodeMatch[1]);
  }
  return null;
};

const scheduleTaskRestart = (taskName, port) => {
  if (terminated) {
    return;
  }
  const attempts = restartCounts.get(taskName) ?? 0;
  if (attempts >= MAX_RESTARTS) {
    console.log(
      `[${taskName}] giving up after ${attempts} restart attempt(s)`
    );
    return;
  }
  restartCounts.set(taskName, attempts + 1);
  console.log(
    `[${taskName}] detected port ${port} in use, restarting (${attempts + 1}/${MAX_RESTARTS})`
  );
  ensurePortFree(port, taskName);
  const existingChild = taskChildren.get(taskName);
  if (existingChild && !existingChild.killed) {
    existingChild.kill("SIGINT");
  }
  if (taskName === "mobile-packager") {
    const androidChild = taskChildren.get("mobile-android");
    if (androidChild && !androidChild.killed) {
      androidChild.kill("SIGINT");
    }
    androidStarted = false;
    restartCounts.delete("mobile-android");
  }
  if (restartingTasks.has(taskName)) {
    return;
  }
  const runner = restartHandlers.get(taskName);
  if (!runner) {
    return;
  }
  restartingTasks.add(taskName);
  setTimeout(() => {
    restartingTasks.delete(taskName);
    runner();
  }, 500);
};

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

const tasks = [
  {
    name: "api",
    command: "npm",
    args: ["run", "start:dev"],
    cwd: path.join(__dirname, "..", "apps", "api"),
  },
  {
    name: "web",
    command: "npm",
    args: ["run", "dev", ...parseArgList("web-args")],
    cwd: path.join(__dirname, "..", "apps", "web"),
  },
  {
    name: "mobile-packager",
    command: "npm",
    args: ["run", "start", "--", "--port", PORT, ...parseArgList("mobile-args")],
    cwd: path.join(__dirname, "..", "apps", "mobile"),
  },
];

const mobileAndroidTask = {
  name: "mobile-android",
  command: "npm",
  args: ["run", "android", ...parseArgList("android-args")],
  cwd: path.join(__dirname, "..", "apps", "mobile"),
};

const screen = blessed.screen({
  smartCSR: true,
  title: "Dev All Columns",
});

const layout = blessed.layout({
  parent: screen,
  layout: "grid",
  width: "100%",
  height: "100%",
});

const headerEmoji = {
  api: "[API]",
  web: "[WEB]",
  "mobile-packager": "[PACK]",
};
const boxes = {};
["api", "web", "mobile-packager"].forEach((name, index) => {
  boxes[name] = blessed.log({
    parent: layout,
    top: 0,
    left: `${index * 33}%`,
    width: `${Math.floor(100 / 3)}%`,
    height: "100%",
    label: ` ${headerEmoji[name]} ${name.toUpperCase()} `,
    border: "line",
    scrollable: true,
    scrollbar: { ch: " ", style: { bg: "blue" } },
  });
});

const sendToMobilePackager = (input) => {
  const packager = taskChildren.get("mobile-packager");
  if (!packager || !packager.stdin || packager.stdin.destroyed) {
    return false;
  }
  packager.stdin.write(input);
  return true;
};

const commandKeys = ["r", "R", "d", "D", "m", "M", "j", "J", "p", "P", "o", "O", "s", "S", "c", "C", "l", "L", "?", "h", "H"];
commandKeys.forEach((key) =>
  screen.key(key, () => sendToMobilePackager(key === "?" ? "?" : key))
);
screen.key(["enter"], () => sendToMobilePackager("\n"));
screen.key(["C-c", "q"], () => {
  terminate();
});

const children = [];
const androidTriggers = [
  "Logs for your project will appear below",
  "Tunnel ready",
  "Metro Bundler ready",
  "Tunnel ready at",
];
let androidStarted = false;
let terminated = false;

const logToBox = (name, chunk) => {
  const text = chunk.toString().trim();
  if (!text) return;
  const box = boxes[name];
  if (!box) return;
  box.log(text);
  screen.render();
  const conflictPort = detectPortConflict(text);
  if (conflictPort) {
    scheduleTaskRestart(name, conflictPort);
  }
};

function startTask(task) {
  if (restartHandlers.has(task.name)) {
    restartHandlers.get(task.name)();
    return;
  }

  const runInstance = () => {
    const env = { ...process.env };
    if (task.name === "mobile-android") {
      env.EXPO_PACKAGER_PORT = PORT;
    }
    if (task.name === "api") {
      ensurePortFree(API_PORT, "api");
    }
    if (task.name === "mobile-packager") {
      ensurePortFree(PORT, "mobile-packager");
    }
    const child = spawn(task.command, task.args, {
      cwd: task.cwd,
      env,
      shell: process.platform === "win32",
    });
    taskChildren.set(task.name, child);
    child.stdout.on("data", (data) => {
      logToBox(task.name, data);
      if (
        task.name === "mobile-packager" &&
        !androidStarted &&
        androidTriggers.some((trigger) =>
          data.toString().toLowerCase().includes(trigger.toLowerCase())
        )
      ) {
        androidStarted = true;
        startTask(mobileAndroidTask);
      }
    });
    child.stderr.on("data", (data) => logToBox(task.name, data));
    child.on("exit", (code, signal) => {
      if (taskChildren.get(task.name) === child) {
        taskChildren.delete(task.name);
      }
      logToBox(
        task.name,
        Buffer.from(`[exit] ${signal || `code ${code ?? "unknown"}`}`)
      );
    });
    child.on("error", (err) =>
      logToBox(task.name, Buffer.from(`[error] ${err.message}`))
    );
    children.push(child);
    if (task.name === "mobile-packager") {
      console.log(
        "[PACK] mobile-packager shortcuts: `r` reload, `R` restart, `d` dev menu, `j` debugger, `m` metro menu"
      );
    }
  };

  restartHandlers.set(task.name, runInstance);
  runInstance();
}

const startAll = () => tasks.forEach(startTask);

const terminate = () => {
  if (terminated) {
    return;
  }
  terminated = true;
  children.forEach((child) => {
    if (!child.killed) {
      child.kill("SIGINT");
    }
  });
  screen.destroy();
  process.exit();
};

["SIGINT", "SIGTERM", "SIGHUP"].forEach((signal) =>
  process.on(signal, terminate)
);
process.on("exit", terminate);

startAll();
