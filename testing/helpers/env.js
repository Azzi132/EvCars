"use strict";

const os = require("os");

function banner(title) {
  const cpus = os.cpus();
  const cpu = cpus[0] ? cpus[0].model.trim() : "unknown";
  const ramGb = (os.totalmem() / 1024 ** 3).toFixed(1);
  console.log("");
  console.log(title);
  console.log("=".repeat(title.length));
  console.log(
    `[env] node=${process.version} platform=${os.platform()}/${os.arch()}`,
  );
  console.log(`[env] cpu="${cpu}" cores=${cpus.length} ram=${ramGb}GB`);
  console.log(`[env] timestamp=${new Date().toISOString()}`);
}

module.exports = { banner };
