// Local development only. Never display credentials or replace existing keys.
const fs = require("node:fs"),
  path = require("node:path"),
  { randomBytes } = require("node:crypto");
const file = path.resolve(__dirname, "../apps/api/.env");
let source = fs.readFileSync(file, "utf8");
const existing = require("dotenv").parse(source);
if (
  existing.NODE_ENV === "production" ||
  !["localhost", "127.0.0.1", "[::1]"].includes(
    new URL(existing.DATABASE_URL).hostname,
  )
)
  throw new Error("This setup command is for local development only");
const defaults = {
  EMAIL_DRIVER: "smtp",
  WEB_ORIGIN: "http://localhost:4200",
  REDIS_URL: "redis://127.0.0.1:6380",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "1025",
  SMTP_SECURE: "false",
  SMTP_REQUIRE_TLS: "false",
  SMTP_FROM: "Micro HRMS <no-reply@microhrms.test>",
  NOTIFICATION_KEY_VERSION: "v1",
  NOTIFICATION_DATA_KEYS: JSON.stringify({
    v1: randomBytes(32).toString("base64"),
  }),
};
for (const [key, value] of Object.entries(defaults))
  if (!Object.hasOwn(existing, key)) source += `\n${key}=${value}`;
fs.writeFileSync(file, source.replace(/\s*$/, "") + "\n");
console.log(
  "Added missing local notification settings. Existing values/keys preserved; no credentials displayed.",
);
