// Mongoose schema for application users.
// Passwords are stored as bcrypt hashes (hashing happens at the call site,
// e.g. addUser.js) — never store the plaintext.

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});

module.exports = mongoose.model("User", userSchema);
