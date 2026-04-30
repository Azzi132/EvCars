// Express middleware that gates a route behind a valid JWT.
// Expects an `Authorization: Bearer <token>` header. On success, attaches
// the decoded `userId` to `req` so downstream handlers can scope queries
// to the current user. On any failure (missing header, bad scheme, expired
// or tampered token) it short-circuits with a 401.

const jwt = require("jsonwebtoken");

module.exports = function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res
      .status(401)
      .json({ message: "Missing or invalid Authorization header." });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch (err) {
    // jwt.verify throws on expiry, bad signature, or malformed token.
    // We collapse all of those into one generic 401 — clients just need
    // to know "log in again", not the specific reason.
    return res.status(401).json({ message: "Invalid or expired token." });
  }
};
