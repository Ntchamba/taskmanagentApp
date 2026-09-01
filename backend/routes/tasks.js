'use strict';

const express = require('express');
const db = require('../db');
const { authRequired } = require('../auth');
const { MEMBER_IDS } = require('../members');

const router = express.Router();
router.use(authRequired);

const PRIORITIES = ['low', 'medium', 'high'];
const STAGES = ['research', 'design', 'in_review', 'development'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const TASK_SELECT = `
  SELECT t.*, c.name AS category_name
    FROM tasks t
    LEFT JOIN categories c ON c.id = t.category_id
`;

function serialize(row) {
  let assignees = [];
  try {
    const parsed = JSON.parse(row.assignees || '[]');
    if (Array.isArray(parsed)) assignees = parsed.filter((id) => MEMBER_IDS.has(id));
  } catch {
    assignees = [];
  }
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    due_date: row.due_date,
    priority: row.priority,
    stage: STAGES.includes(row.stage) ? row.stage : 'research',
    assignees,
    completed: !!row.completed,
    category_id: row.category_id,
    category_name: row.category_name || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function userOwnsCategory(userId, categoryId) {
  return !!db
    .prepare('SELECT id FROM categories WHERE id = ? AND user_id = ?')
    .get(categoryId, userId);
}

// Returns { value } on success or { error } on failure. `undefined` input -> { value: null }.
function normalizeDueDate(input) {
  if (input === undefined || input === null || input === '') return { value: null };
  if (typeof input !== 'string' || !DATE_RE.test(input)) {
    return { error: 'Due date must be in YYYY-MM-DD format' };
  }
  return { value: input };
}

// Returns { value: <json string> } or { error }. `undefined` -> { value: undefined } (no change).
function normalizeAssignees(input) {
  if (input === undefined) return { value: undefined };
  if (!Array.isArray(input)) return { error: 'Assignees must be an array of member ids' };
  const ids = [...new Set(input)];
  for (const id of ids) {
    if (!MEMBER_IDS.has(id)) return { error: `Unknown member id: ${id}` };
  }
  return { value: JSON.stringify(ids) };
}

// GET /api/tasks[?category_id=]
router.get('/', (req, res) => {
  const params = [req.userId];
  let sql = `${TASK_SELECT} WHERE t.user_id = ?`;

  const { category_id: categoryId } = req.query;
  if (categoryId !== undefined && categoryId !== '') {
    sql += ' AND t.category_id = ?';
    params.push(categoryId);
  }

  // Incomplete first, then earliest due date, tasks without a due date last.
  sql += `
    ORDER BY t.completed ASC,
             CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END ASC,
             t.due_date ASC,
             t.created_at ASC`;

  const rows = db.prepare(sql).all(...params);
  res.json({ tasks: rows.map(serialize) });
});

// POST /api/tasks
router.post('/', (req, res) => {
  const body = req.body || {};

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return res.status(400).json({ error: 'Title is required' });

  const priority = body.priority == null || body.priority === '' ? 'medium' : body.priority;
  if (!PRIORITIES.includes(priority)) {
    return res.status(400).json({ error: 'Priority must be low, medium, or high' });
  }

  const stage = body.stage == null || body.stage === '' ? 'research' : body.stage;
  if (!STAGES.includes(stage)) {
    return res.status(400).json({ error: 'Stage must be research, design, in_review, or development' });
  }

  const due = normalizeDueDate(body.due_date);
  if (due.error) return res.status(400).json({ error: due.error });

  const assignees = normalizeAssignees(body.assignees);
  if (assignees.error) return res.status(400).json({ error: assignees.error });

  let categoryId = null;
  if (body.category_id != null && body.category_id !== '') {
    if (!userOwnsCategory(req.userId, body.category_id)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    categoryId = body.category_id;
  }

  const description =
    typeof body.description === 'string' && body.description.trim()
      ? body.description.trim()
      : null;

  const info = db
    .prepare(
      `INSERT INTO tasks (user_id, category_id, title, description, due_date, priority, stage, assignees)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.userId,
      categoryId,
      title,
      description,
      due.value,
      priority,
      stage,
      assignees.value ?? '[]'
    );

  const row = db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ task: serialize(row) });
});

// PATCH /api/tasks/:id  (partial update; also moves columns via `stage` and toggles `completed`)
router.patch('/:id', (req, res) => {
  const existing = db
    .prepare('SELECT id FROM tasks WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  const body = req.body || {};
  const updates = {};

  if (body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) return res.status(400).json({ error: 'Title cannot be empty' });
    updates.title = title;
  }

  if (body.description !== undefined) {
    updates.description =
      typeof body.description === 'string' && body.description.trim()
        ? body.description.trim()
        : null;
  }

  if (body.due_date !== undefined) {
    const due = normalizeDueDate(body.due_date);
    if (due.error) return res.status(400).json({ error: due.error });
    updates.due_date = due.value;
  }

  if (body.priority !== undefined) {
    if (!PRIORITIES.includes(body.priority)) {
      return res.status(400).json({ error: 'Priority must be low, medium, or high' });
    }
    updates.priority = body.priority;
  }

  if (body.stage !== undefined) {
    if (!STAGES.includes(body.stage)) {
      return res
        .status(400)
        .json({ error: 'Stage must be research, design, in_review, or development' });
    }
    updates.stage = body.stage;
  }

  if (body.assignees !== undefined) {
    const a = normalizeAssignees(body.assignees);
    if (a.error) return res.status(400).json({ error: a.error });
    updates.assignees = a.value;
  }

  if (body.category_id !== undefined) {
    if (body.category_id === null || body.category_id === '') {
      updates.category_id = null;
    } else if (userOwnsCategory(req.userId, body.category_id)) {
      updates.category_id = body.category_id;
    } else {
      return res.status(400).json({ error: 'Invalid category' });
    }
  }

  if (body.completed !== undefined) {
    updates.completed = body.completed ? 1 : 0;
  }

  const columns = Object.keys(updates);
  if (columns.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  const setClause = columns.map((col) => `${col} = ?`).join(', ');
  const values = columns.map((col) => updates[col]);
  db.prepare(
    `UPDATE tasks SET ${setClause}, updated_at = datetime('now') WHERE id = ? AND user_id = ?`
  ).run(...values, req.params.id, req.userId);

  const row = db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(req.params.id);
  res.json({ task: serialize(row) });
});

// DELETE /api/tasks/:id
router.delete('/:id', (req, res) => {
  const info = db
    .prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.userId);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'Task not found' });
  }
  res.status(204).end();
});

module.exports = router;
