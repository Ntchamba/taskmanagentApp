'use strict';

// Seeded, fixed member roster. This app is single-user; members exist only so tasks
// can carry assignees and the board can show avatars / filter by person.
// These are NOT real accounts.
const MEMBERS = [
  { id: 'm1', name: 'Alex Morgan', email: 'alex@welltask.app', avatar: '/assets/avatars/m1.svg' },
  { id: 'm2', name: 'Sam Rivera', email: 'sam@welltask.app', avatar: '/assets/avatars/m2.svg' },
  { id: 'm3', name: 'Jordan Lee', email: 'jordan@welltask.app', avatar: '/assets/avatars/m3.svg' },
  { id: 'm4', name: 'Casey Kim', email: 'casey@welltask.app', avatar: '/assets/avatars/m4.svg' },
  { id: 'm5', name: 'Taylor Fox', email: 'taylor@welltask.app', avatar: '/assets/avatars/m5.svg' },
  { id: 'm6', name: 'Riley Chen', email: 'riley@welltask.app', avatar: '/assets/avatars/m6.svg' },
];

const MEMBER_IDS = new Set(MEMBERS.map((m) => m.id));

module.exports = { MEMBERS, MEMBER_IDS };
