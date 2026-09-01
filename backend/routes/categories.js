'use strict';

const express = require('express');
const db = require('../db');
const { authRequired } = require('../auth');

const router = express.Router();
router.use(authRequired);

const MAX_NAME_LENGTH = 50;

function readName(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) return { error: 'Category name is required' };
  if (name.length > MAX_NAME_LENGTH) {
    return { error: `Category name must be ${MAX_NAME_LENGTH} characters or fewer` };
  }
  return { name };
}

// GET /api/categories  -> list with a task_count per category
router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.id, c.name, c.created_at, COUNT(t.id) AS task_count
         FROM categories c
         LEFT JOIN tasks t ON t.category_id = c.id
        WHERE c.user_id = ?
        GROUP BY c.id
        ORDER BY c.name COLLATE NOCASE`
    )
    .all(req.userId);
  res.json({ categories: rows });
});

// POST /api/categories
router.post('/', (req, res) => {
  const { name, error } = readName(req.body);
  if (error) return res.status(400).json({ error });

  const info = db
    .prepare('INSERT INTO categories (user_id, name) VALUES (?, ?)')
    .run(req.userId, name);
  res.status(201).json({ category: { id: info.lastInsertRowid, name, task_count: 0 } });
});

// PATCH /api/categories/:id
router.patch('/:id', (req, res) => {
  const { name, error } = readName(req.body);
  if (error) return res.status(400).json({ error });

  const info = db
    .prepare('UPDATE categories SET name = ? WHERE id = ? AND user_id = ?')
    .run(name, req.params.id, req.userId);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'Category not found' });
  }
  res.json({ category: { id: Number(req.params.id), name } });
});

// DELETE /api/categories/:id  (tasks in this category are kept, just uncategorized)
router.delete('/:id', (req, res) => {
  const info = db
    .prepare('DELETE FROM categories WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.userId);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'Category not found' });
  }
  res.status(204).end();
});

module.exports = router;
