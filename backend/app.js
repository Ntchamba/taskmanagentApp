'use strict';

const path = require('node:path');
const express = require('express');

const authRoutes = require('./routes/auth');
const categoryRoutes = require('./routes/categories');
const taskRoutes = require('./routes/tasks');
const memberRoutes = require('./routes/members');

const app = express();

app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/members', memberRoutes);

// Unknown API routes should return JSON, not the SPA fallback.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Static frontend (index.html served automatically at "/").
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Central error handler.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
