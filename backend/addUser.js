// One-shot script to create a test user in MongoDB.
// Run with `npm run seed` (or `node addUser.js`). Idempotent — if the user
// already exists it just exits without touching anything.

require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");

// Change these if you want a different test account.
const USERNAME = "admin";
const PASSWORD = "password123";

async function seedUser() {
  await mongoose.connect(process.env.MONGODB_URI);

  const existing = await User.findOne({ username: USERNAME });
  if (existing) {
    console.log(`User "${USERNAME}" already exists, skipping.`);
  } else {
    // bcrypt cost factor 10 is a reasonable default for dev — login still
    // feels instant and brute-forcing the hash is non-trivial.
    const hashedPassword = await bcrypt.hash(PASSWORD, 10);
    await User.create({ username: USERNAME, password: hashedPassword });
    console.log(`User "${USERNAME}" created successfully.`);
  }

  await mongoose.disconnect();
}

seedUser().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
