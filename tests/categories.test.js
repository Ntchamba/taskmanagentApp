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

test("categories require authentication", async () => {
  const res = await request(app).get("/api/categories");
  assert.equal(res.status, 401);
});

test("create, list (with counts), rename, and delete a category", async () => {
  const token = await tokenFor("cat@example.com");
  const auth = (req) => req.set("Authorization", `Bearer ${token}`);

  const created = await auth(
    request(app).post("/api/categories").send({ name: "Work" })
  );
  assert.equal(created.status, 201);
  const catId = created.body.category.id;

  await auth(request(app).post("/api/tasks").send({ title: "T1", category_id: catId }));

  const list = await auth(request(app).get("/api/categories"));
  assert.equal(list.status, 200);
  assert.equal(list.body.categories.length, 1);
  assert.equal(list.body.categories[0].task_count, 1);

  const renamed = await auth(
    request(app).patch(`/api/categories/${catId}`).send({ name: "Job" })
  );
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.category.name, "Job");

  const del = await auth(request(app).delete(`/api/categories/${catId}`));
  assert.equal(del.status, 204);

  const after = await auth(request(app).get("/api/categories"));
  assert.equal(after.body.categories.length, 0);
});

test("a blank category name is rejected", async () => {
  const token = await tokenFor("blank@example.com");
  const res = await request(app)
    .post("/api/categories")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "   " });
  assert.equal(res.status, 400);
});

test("categories are scoped per user", async () => {
  const t1 = await tokenFor("u1@example.com");
  const t2 = await tokenFor("u2@example.com");

  await request(app)
    .post("/api/categories")
    .set("Authorization", `Bearer ${t1}`)
    .send({ name: "Private" });

  const list2 = await request(app)
    .get("/api/categories")
    .set("Authorization", `Bearer ${t2}`);
  assert.equal(list2.body.categories.length, 0);

  const created = await request(app)
    .post("/api/categories")
    .set("Authorization", `Bearer ${t1}`)
    .send({ name: "Mine" });
  const foreignDelete = await request(app)
    .delete(`/api/categories/${created.body.category.id}`)
    .set("Authorization", `Bearer ${t2}`);
  assert.equal(foreignDelete.status, 404);
});

test("deleting a category keeps its tasks but clears their category", async () => {
  const token = await tokenFor("keep@example.com");
  const auth = (req) => req.set("Authorization", `Bearer ${token}`);

  const cat = await auth(request(app).post("/api/categories").send({ name: "Temp" }));
  const catId = cat.body.category.id;
  await auth(request(app).post("/api/tasks").send({ title: "Keeper", category_id: catId }));

  await auth(request(app).delete(`/api/categories/${catId}`));

  const tasks = await auth(request(app).get("/api/tasks"));
  assert.equal(tasks.body.tasks.length, 1);
  assert.equal(tasks.body.tasks[0].category_id, null);
});
