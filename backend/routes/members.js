'use strict';

const express = require('express');
const { authRequired } = require('../auth');
const { MEMBERS } = require('../members');

const router = express.Router();
router.use(authRequired);

// GET /api/members  -> the seeded roster used for task assignees + avatars
router.get('/', (req, res) => {
  res.json({ members: MEMBERS });
});

module.exports = router;
