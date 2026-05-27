"use strict";

const fs = require("fs");
const path = require("path");

function writeCsv(filePath, header, rows) {
  const lines = [header.join(",")];
  for (const r of rows) lines.push(r.map((v) => String(v)).join(","));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, lines.join("\n") + "\n");
}

function center(s, width) {
  s = String(s);
  if (s.length >= width) return s;
  const total = width - s.length;
  const left = Math.floor(total / 2);
  return " ".repeat(left) + s + " ".repeat(total - left);
}

function printTable(title, header, rows) {
  console.log("");
  console.log(title);
  console.log("=".repeat(title.length));
  const widths = header.map((h, c) => {
    let w = String(h).length;
    for (const r of rows) w = Math.max(w, String(r[c]).length);
    return w + 2;
  });
  const fmtRow = (cells) =>
    cells.map((cell, c) => center(cell, widths[c])).join("|");
  console.log(fmtRow(header));
  console.log(widths.map((w) => "-".repeat(w)).join("+"));
  for (const r of rows) console.log(fmtRow(r));
}

module.exports = { writeCsv, printTable };
