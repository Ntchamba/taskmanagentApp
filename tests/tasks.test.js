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

test("tasks require authentication", async () => {
  const res = await request(app).get("/api/tasks");
  assert.equal(res.status, 401);
});

test("creating a task applies defaults and validates input", async () => {
  const token = await tokenFor("task@example.com");
  const auth = (req) => req.set("Authorization", `Bearer ${token}`);

  const noTitle = await auth(request(app).post("/api/tasks").send({ description: "x" }));
  assert.equal(noTitle.status, 400);

  const badPriority = await auth(
    request(app).post("/api/tasks").send({ title: "x", priority: "urgent" })
  );
  assert.equal(badPriority.status, 400);

  const badDate = await auth(
    request(app).post("/api/tasks").send({ title: "x", due_date: "2020/01/01" })
  );
  assert.equal(badDate.status, 400);

  const ok = await auth(request(app).post("/api/tasks").send({ title: "Write report" }));
  assert.equal(ok.status, 201);
  assert.equal(ok.body.task.priority, "medium");
  assert.equal(ok.body.task.completed, false);
  assert.equal(ok.body.task.due_date, null);
  assert.equal(ok.body.task.stage, "research");
  assert.deepEqual(ok.body.task.assignees, []);
});

test("stage: defaults to research, accepts valid stages, rejects invalid", async () => {
  const token = await tokenFor("stage@example.com");
  const auth = (req) => req.set("Authorization", `Bearer ${token}`);

  const bad = await auth(
    request(app).post("/api/tasks").send({ title: "x", stage: "backlog" })
  );
  assert.equal(bad.status, 400);

  const made = await auth(
    request(app).post("/api/tasks").send({ title: "Design work", stage: "design" })
  );
  assert.equal(made.status, 201);
  assert.equal(made.body.task.stage, "design");

  const moved = await auth(
    request(app).patch(`/api/tasks/${made.body.task.id}`).send({ stage: "in_review" })
  );
  assert.equal(moved.status, 200);
  assert.equal(moved.body.task.stage, "in_review");

  const badMove = await auth(
    request(app).patch(`/api/tasks/${made.body.task.id}`).send({ stage: "nope" })
  );
  assert.equal(badMove.status, 400);
});

test("assignees: accepts known member ids, rejects unknown, dedupes", async () => {
  const token = await tokenFor("assignee@example.com");
  const auth = (req) => req.set("Authorization", `Bearer ${token}`);

  const bad = await auth(
    request(app).post("/api/tasks").send({ title: "x", assignees: ["m1", "ghost"] })
  );
  assert.equal(bad.status, 400);

  const notArray = await auth(
    request(app).post("/api/tasks").send({ title: "x", assignees: "m1" })
  );
  assert.equal(notArray.status, 400);

  const ok = await auth(
    request(app)
      .post("/api/tasks")
      .send({ title: "Pair task", assignees: ["m1", "m3", "m1"] })
  );
  assert.equal(ok.status, 201);
  assert.deepEqual(ok.body.task.assignees, ["m1", "m3"]);

  const cleared = await auth(
    request(app).patch(`/api/tasks/${ok.body.task.id}`).send({ assignees: [] })
  );
  assert.deepEqual(cleared.body.task.assignees, []);
});

test("rejects a task pointing at another user's category", async () => {
  const owner = await tokenFor("owner-cat@example.com");
  const other = await tokenFor("other-cat@example.com");

  const cat = await request(app)
    .post("/api/categories")
    .set("Authorization", `Bearer ${owner}`)
    .send({ name: "Owned" });

  const res = await request(app)
    .post("/api/tasks")
    .set("Authorization", `Bearer ${other}`)
    .send({ title: "Sneaky", category_id: cat.body.category.id });
  assert.equal(res.status, 400);
});

test("list is sorted by due date, nulls last, incomplete first", async () => {
  const token = await tokenFor("sort@example.com");
  const auth = (req) => req.set("Authorization", `Bearer ${token}`);

  await auth(request(app).post("/api/tasks").send({ title: "no date" }));
  await auth(request(app).post("/api/tasks").send({ title: "later", due_date: "2099-12-31" }));
  await auth(request(app).post("/api/tasks").send({ title: "sooner", due_date: "2099-01-01" }));

  const done = await auth(
    request(app).post("/api/tasks").send({ title: "done early", due_date: "2098-01-01" })
  );
  await auth(
    request(app).patch(`/api/tasks/${done.body.task.id}`).send({ completed: true })
  );

  const res = await auth(request(app).get("/api/tasks"));
  assert.deepEqual(
    res.body.tasks.map((t) => t.title),
    ["sooner", "later", "no date", "done early"]
  );
});

test("filter by category_id returns only that category's tasks", async () => {
  const token = await tokenFor("filter@example.com");
  const auth = (req) => req.set("Authorization", `Bearer ${token}`);

  const cat = await auth(request(app).post("/api/categories").send({ name: "Home" }));
  const catId = cat.body.category.id;
  await auth(request(app).post("/api/tasks").send({ title: "in", category_id: catId }));
  await auth(request(app).post("/api/tasks").send({ title: "out" }));

  const res = await auth(request(app).get(`/api/tasks?category_id=${catId}`));
  assert.equal(res.body.tasks.length, 1);
  assert.equal(res.body.tasks[0].title, "in");
});

test("update, complete, and delete a task", async () => {
  const token = await tokenFor("update@example.com");
  const auth = (req) => req.set("Authorization", `Bearer ${token}`);

  const created = await auth(request(app).post("/api/tasks").send({ title: "Draft" }));
  const id = created.body.task.id;

  const patched = await auth(
    request(app).patch(`/api/tasks/${id}`).send({ title: "Final", priority: "high" })
  );
  assert.equal(patched.status, 200);
  assert.equal(patched.body.task.title, "Final");
  assert.equal(patched.body.task.priority, "high");

  const cleared = await auth(
    request(app).patch(`/api/tasks/${id}`).send({ due_date: "2099-05-05" })
  );
  assert.equal(cleared.body.task.due_date, "2099-05-05");
  const unset = await auth(
    request(app).patch(`/api/tasks/${id}`).send({ due_date: null })
  );
  assert.equal(unset.body.task.due_date, null);

  const done = await auth(
    request(app).patch(`/api/tasks/${id}`).send({ completed: true })
  );
  assert.equal(done.body.task.completed, true);

  const del = await auth(request(app).delete(`/api/tasks/${id}`));
  assert.equal(del.status, 204);

  const after = await auth(request(app).get("/api/tasks"));
  assert.equal(after.body.tasks.length, 0);
});

test("a user cannot read, edit, or delete another user's task", async () => {
  const owner = await tokenFor("owner@example.com");
  const intruder = await tokenFor("intruder@example.com");

  const created = await request(app)
    .post("/api/tasks")
    .set("Authorization", `Bearer ${owner}`)
    .send({ title: "Secret" });
  const id = created.body.task.id;

  const patch = await request(app)
    .patch(`/api/tasks/${id}`)
    .set("Authorization", `Bearer ${intruder}`)
    .send({ title: "Hacked" });
  assert.equal(patch.status, 404);

  const del = await request(app)
    .delete(`/api/tasks/${id}`)
    .set("Authorization", `Bearer ${intruder}`);
  assert.equal(del.status, 404);

  const list = await request(app)
    .get("/api/tasks")
    .set("Authorization", `Bearer ${intruder}`);
  assert.equal(list.body.tasks.length, 0);
});
