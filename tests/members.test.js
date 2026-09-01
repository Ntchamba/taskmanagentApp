"use strict";

process.env.DB_PATH = ":memory:";
process.env.JWT_SECRET = "test-secret";

const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../backend/app");

async function tokenFor(email) {
  const res = await request(app)
    .post("/api/auth/signup")
    .send({ email, password: "password123" });
  return res.body.token;
}

test("members require authentication", async () => {
  const res = await request(app).get("/api/members");
  assert.equal(res.status, 401);
});

test("members returns the seeded roster", async () => {
  const token = await tokenFor("members@example.com");
  const res = await request(app)
    .get("/api/members")
    .set("Authorization", `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.members));
  assert.equal(res.body.members.length, 6);
  for (const m of res.body.members) {
    assert.ok(m.id && m.name && m.email && m.avatar);
    assert.match(m.avatar, /^\/assets\/avatars\/.+\.svg$/);
  }
});
