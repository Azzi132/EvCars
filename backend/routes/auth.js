const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });
    res.json({ token, user: { id: user._id, username: user.username } });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    const trimmedUsername = typeof username === "string" ? username.trim() : "";
    if (!trimmedUsername || typeof password !== "string" || !password) {
      return res
        .status(400)
        .json({ message: "Username and password are required" });
    }
    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    const existing = await User.findOne({ username: trimmedUsername });
    if (existing) {
      return res.status(409).json({ message: "Username already taken" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let user;
    try {
      user = await User.create({
        username: trimmedUsername,
        password: hashedPassword,
      });
    } catch (err) {
      if (err && err.code === 11000) {
        return res.status(409).json({ message: "Username already taken" });
      }
      throw err;
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });
    res
      .status(201)
      .json({ token, user: { id: user._id, username: user.username } });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
