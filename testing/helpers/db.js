"use strict";

const { MongoMemoryServer } = require("mongodb-memory-server");

const Booking = require("../../backend/scheduler/models");
const User = require("../../backend/models/User");
const mongoose = Booking.base;

async function startMongo({ connect = true } = {}) {
  const server = await MongoMemoryServer.create();
  const uri = server.getUri();
  process.env.MONGODB_URI = uri;
  if (connect) await mongoose.connect(uri);
  return server;
}

async function stopMongo(server) {
  try {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  } finally {
    if (server) await server.stop();
  }
}

async function wipeAll() {
  await Booking.deleteMany({});
  await User.deleteMany({});
  const collections = mongoose.connection.collections;
  for (const name of Object.keys(collections)) {
    await collections[name].deleteMany({});
  }
}

async function counts() {
  const [bookings, users] = await Promise.all([
    Booking.countDocuments(),
    User.countDocuments(),
  ]);
  return { bookings, users };
}

async function logCounts(tag) {
  const { bookings, users } = await counts();
  const clean = bookings === 0 && users === 0 ? " (DB clean)" : "";
  console.log(`[setup] ${tag} — bookings=${bookings}, users=${users}${clean}`);
  return { bookings, users };
}

async function assertEmpty(tag = "") {
  const { bookings, users } = await counts();
  if (bookings !== 0 || users !== 0) {
    throw new Error(
      `assertEmpty failed${tag ? ` (${tag})` : ""}: expected 0/0 but found ` +
        `bookings=${bookings}, users=${users}`,
    );
  }
}

async function assertCount(model, expected, label) {
  const n = await model.countDocuments();
  if (n !== expected) {
    throw new Error(
      `assertCount failed (${label}): expected ${expected} but found ${n}`,
    );
  }
  return n;
}

module.exports = {
  startMongo,
  stopMongo,
  wipeAll,
  counts,
  logCounts,
  assertEmpty,
  assertCount,
  Booking,
  User,
  mongoose,
};
