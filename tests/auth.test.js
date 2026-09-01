"use strict";

process.env.DB_PATH = ":memory:";
process.env.JWT_SECRET = "test-secret";

const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../backend/app");

test("signup creates a user and returns a token", async () => {
  const res = await request(app)
    .post("/api/auth/signup")
    .send({ email: "alice@example.com", password: "password123" });

  assert.equal(res.status, 201);
  assert.ok(res.body.token);
  assert.equal(res.body.user.email, "alice@example.com");
});

test("signup lowercases and trims the email", async () => {
  const res = await request(app)
    .post("/api/auth/signup")
    .send({ email: "  MixedCase@Example.com ", password: "password123" });

  assert.equal(res.status, 201);
  assert.equal(res.body.user.email, "mixedcase@example.com");
});

test("signup rejects an invalid email", async () => {
  const res = await request(app)
    .post("/api/auth/signup")
    .send({ email: "not-an-email", password: "password123" });

  assert.equal(res.status, 400);
});

test("signup rejects a short password", async () => {
  const res = await request(app)
    .post("/api/auth/signup")
    .send({ email: "bob@example.com", password: "short" });

  assert.equal(res.status, 400);
});

test("signup rejects a duplicate email", async () => {
  await request(app)
    .post("/api/auth/signup")
    .send({ email: "dup@example.com", password: "password123" });

  const res = await request(app)
    .post("/api/auth/signup")
    .send({ email: "dup@example.com", password: "password123" });

  assert.equal(res.status, 409);
});

test("login succeeds with correct credentials and fails with wrong ones", async () => {
  await request(app)
    .post("/api/auth/signup")
    .send({ email: "carol@example.com", password: "password123" });

  const ok = await request(app)
    .post("/api/auth/login")
    .send({ email: "carol@example.com", password: "password123" });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);

  const bad = await request(app)
    .post("/api/auth/login")
    .send({ email: "carol@example.com", password: "wrong-password" });
  assert.equal(bad.status, 401);

  const missing = await request(app)
    .post("/api/auth/login")
    .send({ email: "nobody@example.com", password: "password123" });
  assert.equal(missing.status, 401);
});

test("GET /me requires a valid token", async () => {
  const anon = await request(app).get("/api/auth/me");
  assert.equal(anon.status, 401);

  const signup = await request(app)
    .post("/api/auth/signup")
    .send({ email: "dave@example.com", password: "password123" });

  const me = await request(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${signup.body.token}`);
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, "dave@example.com");

  const bogus = await request(app)
    .get("/api/auth/me")
    .set("Authorization", "Bearer not.a.real.token");
  assert.equal(bogus.status, 401);
});
