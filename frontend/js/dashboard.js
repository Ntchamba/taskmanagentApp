import { api, getToken, clearToken } from "./api.js";

if (!getToken()) {
  window.location.href = "/index.html";
}

const STAGES = ["research", "design", "in_review", "development"];
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

// ---------- State ----------
let tasks = [];
let categories = [];
let members = [];
const filterTags = new Set(); // category ids as strings
const filterMembers = new Set(); // member ids
let firstRender = true;

let editingTaskId = null;
let modalPriority = "medium";
const modalAssignees = new Set();

// ---------- Elements ----------
const el = {
  profileAvatar: document.getElementById("profile-avatar"),
  profileName: document.getElementById("profile-name"),
  userEmail: document.getElementById("user-email"),
  badge: document.getElementById("mytasks-badge"),
  boardSub: document.getElementById("board-sub"),
  board: document.getElementById("board"),
  logoutBtn: document.getElementById("logout-btn"),
  sidebarAdd: document.getElementById("sidebar-add"),
  newTaskBtn: document.getElementById("new-task-btn"),
  tagFilterList: document.getElementById("tag-filter-list"),
  tagFilterCount: document.getElementById("tag-filter-count"),
  memberFilterList: document.getElementById("member-filter-list"),
  memberFilterCount: document.getElementById("member-filter-count"),
  newTagForm: document.getElementById("new-tag-form"),
  newTagInput: document.getElementById("new-tag-input"),
  tagError: document.getElementById("tag-error"),
  modal: document.getElementById("task-modal"),
  modalTitle: document.getElementById("modal-title"),
  modalClose: document.getElementById("modal-close"),
  form: document.getElementById("task-form"),
  formError: document.getElementById("task-form-error"),
  cancelBtn: document.getElementById("cancel-task-btn"),
  deleteBtn: document.getElementById("delete-task-btn"),
  fTitle: document.getElementById("f-title"),
  fDesc: document.getElementById("f-description"),
  fStage: document.getElementById("f-stage"),
  fDue: document.getElementById("f-due"),
  fCategory: document.getElementById("f-category"),
  priorityPicker: document.getElementById("priority-picker"),
  assigneePicker: document.getElementById("assignee-picker"),
};

// ---------- Date helpers ----------
function todayStr() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
function daysUntil(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const due = new Date(y, m - 1, d);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((due - now) / 86400000);
}
function isOverdue(t) {
  return !t.completed && !!t.due_date && t.due_date < todayStr();
}
function isSoon(t) {
  if (t.completed || !t.due_date) return false;
  const n = daysUntil(t.due_date);
  return n !== null && n >= 0 && n <= 3;
}
function formatDue(iso) {
  if (!iso) return "No date";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

// ---------- Icons (static markup, no user data) ----------
const CAL_ICON = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>`;
const CLOCK_ICON = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

// ---------- Tag colours (deterministic from name) ----------
const TAG_PALETTE = [
  ["#fce7f3", "#9d174d"], // pink
  ["#dcfce7", "#166534"], // green
  ["#dbeafe", "#1e40af"], // blue
  ["#fef3c7", "#92400e"], // amber
  ["#ede9fe", "#5b21b6"], // violet
  ["#ccfbf1", "#115e59"], // teal
  ["#ffe4e6", "#9f1239"], // rose
  ["#e0e7ff", "#3730a3"], // indigo
];
// Common names get an expected colour; everything else is hashed to the palette.
const TAG_HINTS = {
  marketing: 0,
  growth: 0,
  sales: 1,
  done: 1,
  design: 2,
  research: 4,
  bug: 6,
  ops: 5,
};
function tagColors(name) {
  const hint = TAG_HINTS[name.trim().toLowerCase()];
  if (hint !== undefined) return TAG_PALETTE[hint];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TAG_PALETTE[h % TAG_PALETTE.length];
}

// ---------- Data ----------
async function loadAll() {
  const [me, cat, tk, mem] = await Promise.all([
    api("/auth/me"),
    api("/categories"),
    api("/tasks"),
    api("/members"),
  ]);

  const local = me.user.email.split("@")[0];
  el.profileName.textContent = local.charAt(0).toUpperCase() + local.slice(1);
  el.profileAvatar.textContent = local.charAt(0).toUpperCase() || "?";
  el.userEmail.textContent = me.user.email;

  categories = cat.categories;
  tasks = tk.tasks;
  members = mem.members;

  renderFilters();
  renderAssigneePicker();
  populateCategorySelect();
  renderBoard();
  renderBadge();
}

// ---------- Board ----------
function visibleTasks() {
  return tasks.filter((t) => {
    if (filterTags.size && !(t.category_id && filterTags.has(String(t.category_id))))
      return false;
    if (filterMembers.size && !t.assignees.some((a) => filterMembers.has(a))) return false;
    return true;
  });
}

function sortForColumn(a, b) {
  if (a.completed !== b.completed) return a.completed ? 1 : -1;
  if (!a.due_date && b.due_date) return 1;
  if (a.due_date && !b.due_date) return -1;
  if (a.due_date && b.due_date && a.due_date !== b.due_date)
    return a.due_date < b.due_date ? -1 : 1;
  return a.created_at < b.created_at ? -1 : 1;
}

function setCount(node, n) {
  if (node.textContent === String(n)) return;
  node.textContent = n;
  node.classList.remove("is-bumping");
  void node.offsetWidth;
  node.classList.add("is-bumping");
}

function renderBoard() {
  const vis = visibleTasks();
  let enterIndex = 0;

  STAGES.forEach((stage, colIdx) => {
    const column = el.board.querySelector(`.column[data-stage="${stage}"]`);
    const wrap = column.querySelector(".column__cards");
    const placeholder = wrap.querySelector(".card-placeholder");
    wrap.querySelectorAll(".card").forEach((c) => c.remove());

    const items = vis.filter((t) => t.stage === stage).sort(sortForColumn);
    setCount(column.querySelector(".column__count"), items.length);

    for (const task of items) {
      const card = renderCard(task);
      if (firstRender) {
        card.classList.add("card--enter");
        card.style.animationDelay = `${colIdx * 60 + enterIndex * 45}ms`;
        enterIndex += 1;
      }
      if (placeholder) wrap.insertBefore(card, placeholder);
      else wrap.appendChild(card);
    }
  });

  const filtered = filterTags.size || filterMembers.size;
  el.boardSub.textContent =
    `${vis.length} task${vis.length === 1 ? "" : "s"}` + (filtered ? " · filtered" : "");
  firstRender = false;
}

function renderCard(task) {
  const card = document.createElement("article");
  card.className = "card" + (task.completed ? " is-done" : "");
  card.draggable = true;
  card.dataset.id = task.id;

  card.addEventListener("dragstart", (e) => {
    card.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(task.id));
  });
  card.addEventListener("dragend", () => {
    card.classList.remove("dragging");
    clearPlaceholders();
    el.board.querySelectorAll(".column.is-drop").forEach((c) => c.classList.remove("is-drop"));
  });
  card.addEventListener("click", () => openModal(task));

  // Tags: category badge + priority badge
  const tags = document.createElement("div");
  tags.className = "card__tags";
  if (task.category_name) {
    const [bg, fg] = tagColors(task.category_name);
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.style.background = bg;
    tag.style.color = fg;
    tag.textContent = task.category_name;
    tags.appendChild(tag);
  }
  const prio = document.createElement("span");
  prio.className = "tag tag--priority";
  prio.textContent = task.priority;
  tags.appendChild(prio);
  card.appendChild(tags);

  const title = document.createElement("h3");
  title.className = "card__title";
  title.textContent = task.title;
  card.appendChild(title);

  if (task.description) {
    const desc = document.createElement("p");
    desc.className = "card__desc";
    desc.textContent = task.description;
    card.appendChild(desc);
  }

  const footer = document.createElement("div");
  footer.className = "card__footer";

  const due = document.createElement("span");
  due.className = "card__due";
  if (isOverdue(task)) due.classList.add("is-overdue");
  else if (isSoon(task)) due.classList.add("is-soon");
  due.innerHTML = isSoon(task) || isOverdue(task) ? CLOCK_ICON : CAL_ICON;
  const dueText = document.createElement("span");
  dueText.textContent = isOverdue(task) ? `Overdue · ${formatDue(task.due_date)}` : formatDue(task.due_date);
  due.appendChild(dueText);
  footer.appendChild(due);

  const avatars = document.createElement("div");
  avatars.className = "avatars";
  const shown = task.assignees.slice(0, 4);
  for (const id of shown) {
    const m = members.find((x) => x.id === id);
    if (!m) continue;
    const img = document.createElement("img");
    img.src = m.avatar;
    img.alt = m.name;
    img.title = m.name;
    avatars.appendChild(img);
  }
  if (task.assignees.length > shown.length) {
    const more = document.createElement("span");
    more.className = "avatars__more";
    more.textContent = `+${task.assignees.length - shown.length}`;
    avatars.appendChild(more);
  }
  footer.appendChild(avatars);

  card.appendChild(footer);
  return card;
}

function renderBadge() {
  const n = tasks.filter(isOverdue).length;
  el.badge.textContent = n;
  el.badge.hidden = n === 0;
}

// ---------- Drag & drop between columns ----------
function clearPlaceholders() {
  el.board.querySelectorAll(".card-placeholder").forEach((p) => p.remove());
}

function cardAfterPoint(wrap, y) {
  const cards = [...wrap.querySelectorAll(".card:not(.dragging)")];
  let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
  for (const c of cards) {
    const box = c.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) closest = { offset, element: c };
  }
  return closest.element;
}

// FLIP: smoothly slide cards to their new positions around `mutate()`.
function flipRender(mutate) {
  const before = new Map(
    [...el.board.querySelectorAll(".card[data-id]")].map((c) => [
      c.dataset.id,
      c.getBoundingClientRect(),
    ])
  );
  mutate();
  for (const c of el.board.querySelectorAll(".card[data-id]")) {
    const prev = before.get(c.dataset.id);
    if (!prev) continue;
    const now = c.getBoundingClientRect();
    const dx = prev.left - now.left;
    const dy = prev.top - now.top;
    if (!dx && !dy) continue;
    c.style.transition = "none";
    c.style.transform = `translate(${dx}px, ${dy}px)`;
    requestAnimationFrame(() => {
      c.style.transition = `transform 300ms ${EASE}`;
      c.style.transform = "";
    });
    c.addEventListener(
      "transitionend",
      () => {
        c.style.transition = "";
      },
      { once: true }
    );
  }
}

for (const column of document.querySelectorAll(".column")) {
  const wrap = column.querySelector(".column__cards");

  column.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    column.classList.add("is-drop");
    el.board
      .querySelectorAll(".column.is-drop")
      .forEach((c) => c !== column && c.classList.remove("is-drop"));

    let placeholder = wrap.querySelector(".card-placeholder");
    if (!placeholder) {
      clearPlaceholders();
      placeholder = document.createElement("div");
      placeholder.className = "card-placeholder";
    }
    const after = cardAfterPoint(wrap, e.clientY);
    if (after) wrap.insertBefore(placeholder, after);
    else wrap.appendChild(placeholder);
  });

  column.addEventListener("dragleave", (e) => {
    if (!column.contains(e.relatedTarget)) {
      column.classList.remove("is-drop");
      wrap.querySelectorAll(".card-placeholder").forEach((p) => p.remove());
    }
  });

  column.addEventListener("drop", async (e) => {
    e.preventDefault();
    column.classList.remove("is-drop");
    clearPlaceholders();

    const id = e.dataTransfer.getData("text/plain");
    const stage = column.dataset.stage;
    const task = tasks.find((t) => String(t.id) === String(id));
    if (!task || task.stage === stage) return;

    const previous = task.stage;
    task.stage = stage;
    flipRender(renderBoard);

    try {
      const res = await api(`/tasks/${id}`, { method: "PATCH", body: { stage } });
      Object.assign(task, res.task);
      renderBadge();
    } catch (err) {
      task.stage = previous;
      flipRender(renderBoard);
      console.error(err);
    }
  });
}

// ---------- Filters ----------
function renderFilters() {
  el.tagFilterList.innerHTML = "";
  for (const c of categories) {
    const row = document.createElement("label");
    row.className = "filter__row";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = filterTags.has(String(c.id));
    cb.addEventListener("change", () => {
      cb.checked ? filterTags.add(String(c.id)) : filterTags.delete(String(c.id));
      updateFilterCounts();
      flipRender(renderBoard);
    });

    const dot = document.createElement("span");
    dot.className = "filter__dot";
    dot.style.background = tagColors(c.name)[1];

    const name = document.createElement("span");
    name.textContent = `${c.name} (${c.task_count})`;

    const del = document.createElement("button");
    del.type = "button";
    del.className = "filter__del";
    del.textContent = "×";
    del.title = "Delete tag";
    del.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        await api(`/categories/${c.id}`, { method: "DELETE" });
        filterTags.delete(String(c.id));
        await loadAll();
      } catch (err) {
        el.tagError.textContent = err.message;
      }
    });

    row.append(cb, dot, name, del);
    el.tagFilterList.appendChild(row);
  }

  el.memberFilterList.innerHTML = "";
  for (const m of members) {
    const row = document.createElement("label");
    row.className = "filter__row";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = filterMembers.has(m.id);
    cb.addEventListener("change", () => {
      cb.checked ? filterMembers.add(m.id) : filterMembers.delete(m.id);
      updateFilterCounts();
      flipRender(renderBoard);
    });

    const img = document.createElement("img");
    img.className = "filter__ava";
    img.src = m.avatar;
    img.alt = "";

    const name = document.createElement("span");
    name.textContent = m.name;

    row.append(cb, img, name);
    el.memberFilterList.appendChild(row);
  }

  updateFilterCounts();
}

function updateFilterCounts() {
  el.tagFilterCount.textContent = filterTags.size;
  el.tagFilterCount.hidden = filterTags.size === 0;
  el.memberFilterCount.textContent = filterMembers.size;
  el.memberFilterCount.hidden = filterMembers.size === 0;
}

el.newTagForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  el.tagError.textContent = "";
  const name = el.newTagInput.value.trim();
  if (!name) return;
  try {
    await api("/categories", { method: "POST", body: { name } });
    el.newTagInput.value = "";
    await loadAll();
  } catch (err) {
    el.tagError.textContent = err.message;
  }
});

// ---------- Modal ----------
function populateCategorySelect() {
  const current = el.fCategory.value;
  el.fCategory.innerHTML = "";
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "No tag";
  el.fCategory.appendChild(none);
  for (const c of categories) {
    const opt = document.createElement("option");
    opt.value = String(c.id);
    opt.textContent = c.name;
    el.fCategory.appendChild(opt);
  }
  el.fCategory.value = current;
}

function renderPriorityPicker() {
  for (const btn of el.priorityPicker.querySelectorAll(".prio")) {
    btn.classList.toggle("is-selected", btn.dataset.value === modalPriority);
  }
}
el.priorityPicker.addEventListener("click", (e) => {
  const btn = e.target.closest(".prio");
  if (!btn) return;
  modalPriority = btn.dataset.value;
  renderPriorityPicker();
});

function renderAssigneePicker() {
  el.assigneePicker.innerHTML = "";
  for (const m of members) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "assignee" + (modalAssignees.has(m.id) ? " is-selected" : "");
    btn.title = m.name;
    const img = document.createElement("img");
    img.src = m.avatar;
    img.alt = m.name;
    btn.appendChild(img);
    btn.addEventListener("click", () => {
      if (modalAssignees.has(m.id)) modalAssignees.delete(m.id);
      else modalAssignees.add(m.id);
      btn.classList.toggle("is-selected");
    });
    el.assigneePicker.appendChild(btn);
  }
}

function openModal(task = null, presetStage = null) {
  editingTaskId = task ? task.id : null;
  modalPriority = task ? task.priority : "medium";
  modalAssignees.clear();
  (task ? task.assignees : []).forEach((id) => modalAssignees.add(id));

  el.modalTitle.textContent = task ? "Edit task" : "New task";
  el.formError.textContent = "";
  el.fTitle.value = task ? task.title : "";
  el.fDesc.value = task && task.description ? task.description : "";
  el.fStage.value = task ? task.stage : presetStage || "research";
  el.fDue.value = task && task.due_date ? task.due_date : "";
  el.fCategory.value = task && task.category_id ? String(task.category_id) : "";
  el.deleteBtn.hidden = !task;

  renderPriorityPicker();
  renderAssigneePicker();
  el.modal.hidden = false;
  el.fTitle.focus();
}

function closeModal() {
  el.modal.hidden = true;
  editingTaskId = null;
  el.form.reset();
}

el.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  el.formError.textContent = "";

  const title = el.fTitle.value.trim();
  if (!title) {
    el.formError.textContent = "Title is required.";
    return;
  }

  const payload = {
    title,
    description: el.fDesc.value.trim(),
    due_date: el.fDue.value || null,
    priority: modalPriority,
    stage: el.fStage.value,
    category_id: el.fCategory.value || null,
    assignees: [...modalAssignees],
  };

  try {
    let saved;
    if (editingTaskId) {
      saved = await api(`/tasks/${editingTaskId}`, { method: "PATCH", body: payload });
    } else {
      saved = await api("/tasks", { method: "POST", body: payload });
    }
    const newId = saved.task.id;
    closeModal();
    await loadAll();
    const card = el.board.querySelector(`.card[data-id="${newId}"]`);
    if (card) {
      card.classList.add("card--flash");
      card.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  } catch (err) {
    el.formError.textContent = err.message;
  }
});

el.deleteBtn.addEventListener("click", async () => {
  if (!editingTaskId) return;
  try {
    await api(`/tasks/${editingTaskId}`, { method: "DELETE" });
    closeModal();
    await loadAll();
  } catch (err) {
    el.formError.textContent = err.message;
  }
});

// ---------- Wiring ----------
el.logoutBtn.addEventListener("click", () => {
  clearToken();
  window.location.href = "/index.html";
});
el.newTaskBtn.addEventListener("click", () => openModal(null));
el.sidebarAdd.addEventListener("click", () => openModal(null));
document.querySelectorAll(".column__add").forEach((btn) => {
  btn.addEventListener("click", () => openModal(null, btn.dataset.stage));
});
el.modalClose.addEventListener("click", closeModal);
el.cancelBtn.addEventListener("click", closeModal);
el.modal.addEventListener("click", (e) => {
  if (e.target === el.modal) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !el.modal.hidden) closeModal();
});

// ---------- Boot ----------
loadAll().catch((err) => console.error(err));
