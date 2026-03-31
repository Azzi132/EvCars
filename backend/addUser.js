require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");

// Change this to whatev
const USERNAME = "admin";
const PASSWORD = "password123";

// Just console "node addUser.js" to add a specific user quickly
async function seedUser() {
  await mongoose.connect(process.env.MONGODB_URI);

  const existing = await User.findOne({ username: USERNAME });
  if (existing) {
    console.log(`User "${USERNAME}" already exists, skipping.`);
  } else {
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
