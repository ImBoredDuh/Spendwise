// SpendWise - script.js
// COMP250 Group Project
// Jaden Boyce, Adjua Haynes-Griffith, Daquan Sandiford

const usersDB   = new PouchDB("spendwise_users");
const incomeDB  = new PouchDB("spendwise_income");
const expenseDB = new PouchDB("spendwise_expenses");
const budgetDB  = new PouchDB("spendwise_budgets");

let currentUser        = null;
let incomeList         = [];
let expenseList        = [];
let monthlyBudgetLimit = 500;
let budgetDocId        = null;
let editingIncomeId    = null;
let editingExpenseId   = null;

const categoryColors = {
  Food: "#0fb56b", Transport: "#2d73f5", Education: "#7c3aed",
  Entertainment: "#e91e8c", Health: "#f7374f", Shopping: "#f59e0b",
  Housing: "#06b6d4", Other: "#9999b0"
};

const categoryEmoji = {
  Food: "🍔", Transport: "🚌", Education: "📚",
  Entertainment: "🎮", Health: "💊", Shopping: "🛍️",
  Housing: "🏠", Other: "📦"
};

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return "sw_" + Math.abs(hash).toString(16);
}

function isValidEmail(email) {
  return email.includes("@") && email.includes(".");
}

function formatDate(dateStr) {
  const parts  = dateStr.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return parts[2] + " " + months[parseInt(parts[1]) - 1] + " " + parts[0];
}

function getTotal(list, month, year) {
  let total = 0;
  list.forEach(e => {
    if ((!month || e.date.substring(5,7) === month) && (!year || e.date.substring(0,4) === year))
      total += e.amount;
  });
  return total;
}

function getCategorySpending(month, year) {
  const spending = {};
  expenseList.forEach(e => {
    if ((!month || e.date.substring(5,7) === month) && (!year || e.date.substring(0,4) === year))
      spending[e.category] = (spending[e.category] || 0) + e.amount;
  });
  return spending;
}

function renderCategoryRows(el, spending) {
  const cats = Object.keys(spending);
  if (cats.length === 0) { el.innerHTML = '<p class="empty-msg">No expenses recorded yet.</p>'; return; }
  const max = Math.max(...cats.map(k => spending[k]));
  cats.sort((a, b) => spending[b] - spending[a]);
  cats.forEach(cat => {
    const color = categoryColors[cat] || "#888";
    const row = document.createElement("div");
    row.className = "cat-row";
    row.innerHTML =
      '<div class="cat-dot" style="background:' + color + ';"></div>' +
      '<p class="cat-name-text">' + (categoryEmoji[cat] || "") + ' ' + cat + '</p>' +
      '<div class="cat-bar-wrap"><div class="cat-bar-fill" style="width:' + Math.round((spending[cat]/max)*100) + '%;background:' + color + ';"></div></div>' +
      '<p class="cat-amount-text">$' + spending[cat].toFixed(2) + '</p>';
    el.appendChild(row);
  });
}

function buildIncomeRow(e) {
  const item = document.createElement("div");
  item.className = "tx-item";
  item.innerHTML =
    '<div class="tx-icon-wrap" style="background:#d4f7ee;">💵</div>' +
    '<div class="tx-info"><p class="tx-desc">' + e.source + '</p><p class="tx-meta">Income &middot; ' + formatDate(e.date) + '</p></div>' +
    '<p class="tx-amount plus">+$' + e.amount.toFixed(2) + '</p>' +
    '<div class="tx-actions">' +
      '<button class="tx-edit-btn" onclick="editIncome(\'' + e._id + '\')">✏️</button>' +
      '<button class="tx-delete-btn" onclick="deleteIncome(\'' + e._id + '\')">✕</button>' +
    '</div>';
  return item;
}

function buildExpenseRow(e) {
  const color = categoryColors[e.category] || "#aaa";
  const item = document.createElement("div");
  item.className = "tx-item";
  item.innerHTML =
    '<div class="tx-icon-wrap" style="background:' + color + '22;">' + (categoryEmoji[e.category] || "📦") + '</div>' +
    '<div class="tx-info"><p class="tx-desc">' + (e.description || e.category) + '</p><p class="tx-meta">' + e.category + ' &middot; ' + formatDate(e.date) + '</p></div>' +
    '<p class="tx-amount minus">-$' + e.amount.toFixed(2) + '</p>' +
    '<div class="tx-actions">' +
      '<button class="tx-edit-btn" onclick="editExpense(\'' + e._id + '\')">✏️</button>' +
      '<button class="tx-delete-btn" onclick="deleteExpense(\'' + e._id + '\')">✕</button>' +
    '</div>';
  return item;
}


// Auth
function switchTab(tab) {
  document.getElementById("login-form").style.display    = tab === "login"    ? "block" : "none";
  document.getElementById("register-form").style.display = tab === "register" ? "block" : "none";
  document.getElementById("tab-login").classList.toggle("active",    tab === "login");
  document.getElementById("tab-register").classList.toggle("active", tab === "register");
  document.getElementById("login-error").textContent    = "";
  document.getElementById("register-error").textContent = "";
}

function registerUser() {
  const name    = document.getElementById("reg-name").value.trim();
  const email   = document.getElementById("reg-email").value.trim().toLowerCase();
  const pass    = document.getElementById("reg-pass").value;
  const pass2   = document.getElementById("reg-pass2").value;
  const errorEl = document.getElementById("register-error");

  if (!name || !email || !pass) { errorEl.textContent = "Please fill in all fields."; return; }
  if (!isValidEmail(email))     { errorEl.textContent = "Please enter a valid email address."; return; }
  if (pass.length < 6)          { errorEl.textContent = "Password must be at least 6 characters."; return; }
  if (pass !== pass2)           { errorEl.textContent = "Passwords do not match."; return; }

  usersDB.get(email).then(() => {
    errorEl.textContent = "An account with this email already exists.";
  }).catch(err => {
    if (err.name !== "not_found") { errorEl.textContent = "Something went wrong. Please try again."; return; }
    usersDB.put({ _id: email, type: "user", name, email, password: simpleHash(pass) }).then(() => {
      errorEl.style.color = "#0fb56b";
      errorEl.textContent = "Account created! You can now login.";
      setTimeout(() => {
        switchTab("login");
        errorEl.style.color = "#f7374f";
        document.getElementById("login-email").value = email;
      }, 1500);
    }).catch(() => { errorEl.textContent = "Something went wrong. Please try again."; });
  });
}

function loginUser() {
  const email   = document.getElementById("login-email").value.trim().toLowerCase();
  const pass    = document.getElementById("login-pass").value;
  const errorEl = document.getElementById("login-error");

  if (!email || !pass)      { errorEl.textContent = "Please enter your email and password."; return; }
  if (!isValidEmail(email)) { errorEl.textContent = "Please enter a valid email address."; return; }

  usersDB.get(email).then(user => {
    if (user.password !== simpleHash(pass)) { errorEl.textContent = "Incorrect password."; return; }
    startSession(user);
  }).catch(err => {
    errorEl.textContent = err.name === "not_found" ? "No account found with that email." : "Something went wrong. Please try again.";
  });
}

function startSession(user) {
  currentUser = user;
  localStorage.setItem("sw_user", user._id);
  document.getElementById("user-chip").textContent = "👤 " + currentUser.name.split(" ")[0];
  loadUserData().then(() => {
    document.getElementById("auth-screen").style.display = "none";
    document.getElementById("app-screen").style.display  = "flex";
    const today = new Date().toISOString().split("T")[0];
    document.getElementById("inc-date").value = today;
    document.getElementById("exp-date").value = today;
    renderAll();
    checkBudgetNotification();
  });
}

function logoutUser() {
  currentUser = null; incomeList = []; expenseList = [];
  monthlyBudgetLimit = 500; budgetDocId = null;
  editingIncomeId = null; editingExpenseId = null;
  localStorage.removeItem("sw_user");
  document.getElementById("app-screen").style.display  = "none";
  document.getElementById("auth-screen").style.display = "flex";
  document.getElementById("login-email").value = "";
  document.getElementById("login-pass").value  = "";
  document.getElementById("login-error").textContent = "";
  closeNotif();
}

// Auto-login on page load if session exists
window.addEventListener("load", () => {
  const savedEmail = localStorage.getItem("sw_user");
  if (savedEmail) {
    usersDB.get(savedEmail).then(user => {
      startSession(user);
    }).catch(() => {
      localStorage.removeItem("sw_user");
    });
  }
});


// Data
function loadUserData() {
  incomeList = []; expenseList = [];

  const a = incomeDB.allDocs({ include_docs: true }).then(result => {
    result.rows.forEach(r => { if (r.doc.user_id === currentUser._id) incomeList.push(r.doc); });
    incomeList.sort((a, b) => new Date(b.date) - new Date(a.date));
  });

  const b = expenseDB.allDocs({ include_docs: true }).then(result => {
    result.rows.forEach(r => { if (r.doc.user_id === currentUser._id) expenseList.push(r.doc); });
    expenseList.sort((a, b) => new Date(b.date) - new Date(a.date));
  });

  const c = budgetDB.allDocs({ include_docs: true }).then(result => {
    result.rows.forEach(r => {
      if (r.doc.user_id === currentUser._id) { monthlyBudgetLimit = r.doc.monthly_limit; budgetDocId = r.doc._id; }
    });
  });

  return Promise.all([a, b, c]);
}

function afterSave() {
  return loadUserData().then(() => { renderAll(); checkBudgetNotification(); });
}


// Navigation
function showPage(pageName) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-link").forEach(l => {
    l.classList.toggle("active", l.getAttribute("onclick") === "showPage('" + pageName + "')");
  });
  document.querySelectorAll(".bottom-nav-item").forEach(l => {
    l.classList.toggle("active", l.getAttribute("onclick") === "showPage('" + pageName + "')");
  });
  document.getElementById("page-" + pageName).classList.add("active");
  closeSidebar();
  renderAll();
}

function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("sidebar-overlay").classList.toggle("active");
}

function closeSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").classList.remove("active");
}


// Notifications
function checkBudgetNotification() {
  const percent = Math.round((getTotal(expenseList, "", "") / monthlyBudgetLimit) * 100);
  if (percent >= 100) {
    document.getElementById("notif-text").textContent     = "⚠ You have exceeded your monthly budget limit of $" + monthlyBudgetLimit.toFixed(2) + "!";
    document.getElementById("notif-banner").style.display = "flex";
  } else if (percent >= 80) {
    document.getElementById("notif-text").textContent     = "⚠ You have used " + percent + "% of your monthly budget.";
    document.getElementById("notif-banner").style.display = "flex";
  }
}

function closeNotif() {
  document.getElementById("notif-banner").style.display = "none";
}


// Income
function submitIncome() {
  const source  = document.getElementById("inc-source").value.trim();
  const amount  = parseFloat(document.getElementById("inc-amount").value);
  const date    = document.getElementById("inc-date").value;
  const errorEl = document.getElementById("inc-error");

  if (!source)                      { errorEl.textContent = "Please enter an income source."; return; }
  if (isNaN(amount) || amount <= 0) { errorEl.textContent = "Please enter a valid amount greater than 0."; return; }
  if (!date)                        { errorEl.textContent = "Please select a date."; return; }
  errorEl.textContent = "";

  if (editingIncomeId) {
    incomeDB.get(editingIncomeId).then(doc => {
      doc.amount = amount; doc.source = source; doc.date = date;
      return incomeDB.put(doc);
    }).then(() => { editingIncomeId = null; resetIncomeForm(); return afterSave(); });
  } else {
    incomeDB.put({ _id: "income_" + Date.now(), type: "income", user_id: currentUser._id, amount, source, date })
      .then(() => { resetIncomeForm(); return afterSave(); });
  }
}

function editIncome(id) {
  const entry = incomeList.find(e => e._id === id);
  if (!entry) return;
  document.getElementById("inc-source").value = entry.source;
  document.getElementById("inc-amount").value = entry.amount;
  document.getElementById("inc-date").value   = entry.date;
  editingIncomeId = id;
  document.getElementById("inc-form-title").textContent   = "Edit Income";
  document.getElementById("inc-submit-btn").textContent   = "Save Changes";
  document.getElementById("inc-cancel-btn").style.display = "inline-block";
  showPage("income");
}

function cancelEditIncome() { editingIncomeId = null; resetIncomeForm(); }

function resetIncomeForm() {
  document.getElementById("inc-source").value             = "";
  document.getElementById("inc-amount").value             = "";
  document.getElementById("inc-form-title").textContent   = "Add Income";
  document.getElementById("inc-submit-btn").textContent   = "Add Income";
  document.getElementById("inc-cancel-btn").style.display = "none";
  document.getElementById("inc-error").textContent        = "";
}

function deleteIncome(id) {
  incomeDB.get(id).then(doc => incomeDB.remove(doc)).then(afterSave);
}


// Expenses
function submitExpense() {
  const desc     = document.getElementById("exp-desc").value.trim();
  const amount   = parseFloat(document.getElementById("exp-amount").value);
  const category = document.getElementById("exp-category").value;
  const date     = document.getElementById("exp-date").value;
  const errorEl  = document.getElementById("exp-error");

  if (!desc)                        { errorEl.textContent = "Please enter a description."; return; }
  if (isNaN(amount) || amount <= 0) { errorEl.textContent = "Please enter a valid amount greater than 0."; return; }
  if (!date)                        { errorEl.textContent = "Please select a date."; return; }
  errorEl.textContent = "";

  if (editingExpenseId) {
    expenseDB.get(editingExpenseId).then(doc => {
      doc.amount = amount; doc.description = desc; doc.category = category; doc.date = date;
      return expenseDB.put(doc);
    }).then(() => { editingExpenseId = null; resetExpenseForm(); return afterSave(); });
  } else {
    expenseDB.put({ _id: "expense_" + Date.now(), type: "expense", user_id: currentUser._id, amount, description: desc, category, date })
      .then(() => { resetExpenseForm(); return afterSave(); });
  }
}

function editExpense(id) {
  const entry = expenseList.find(e => e._id === id);
  if (!entry) return;
  document.getElementById("exp-desc").value     = entry.description || "";
  document.getElementById("exp-amount").value   = entry.amount;
  document.getElementById("exp-category").value = entry.category;
  document.getElementById("exp-date").value     = entry.date;
  editingExpenseId = id;
  document.getElementById("exp-form-title").textContent   = "Edit Expense";
  document.getElementById("exp-submit-btn").textContent   = "Save Changes";
  document.getElementById("exp-cancel-btn").style.display = "inline-block";
  showPage("expenses");
}

function cancelEditExpense() { editingExpenseId = null; resetExpenseForm(); }

function resetExpenseForm() {
  document.getElementById("exp-desc").value               = "";
  document.getElementById("exp-amount").value             = "";
  document.getElementById("exp-form-title").textContent   = "Add Expense";
  document.getElementById("exp-submit-btn").textContent   = "Add Expense";
  document.getElementById("exp-cancel-btn").style.display = "none";
  document.getElementById("exp-error").textContent        = "";
}

function deleteExpense(id) {
  expenseDB.get(id).then(doc => expenseDB.remove(doc)).then(afterSave);
}


// Budget
function updateBudget() {
  const limit   = parseFloat(document.getElementById("b-limit").value);
  const errorEl = document.getElementById("budget-error");
  if (isNaN(limit) || limit <= 0) { errorEl.textContent = "Please enter a valid budget amount."; return; }
  errorEl.textContent = "";
  monthlyBudgetLimit  = limit;
  document.getElementById("b-limit").value = "";

  if (budgetDocId) {
    budgetDB.get(budgetDocId).then(doc => { doc.monthly_limit = limit; return budgetDB.put(doc); })
      .then(() => { renderAll(); checkBudgetNotification(); });
  } else {
    const doc = { _id: "budget_" + currentUser._id, type: "budget", user_id: currentUser._id, monthly_limit: limit };
    budgetDB.put(doc).then(() => { budgetDocId = doc._id; renderAll(); checkBudgetNotification(); });
  }
}


// Render
function renderDashboard() {
  const totalIncome   = getTotal(incomeList, "", "");
  const totalExpenses = getTotal(expenseList, "", "");
  const balance       = totalIncome - totalExpenses;

  document.getElementById("dash-income").textContent      = "$" + totalIncome.toFixed(2);
  document.getElementById("dash-expenses").textContent    = "$" + totalExpenses.toFixed(2);
  document.getElementById("dash-budget-used").textContent = "$" + totalExpenses.toFixed(2);
  document.getElementById("dash-balance").textContent     = (balance < 0 ? "-$" + Math.abs(balance).toFixed(2) : "$" + balance.toFixed(2));
  if (currentUser) document.getElementById("dash-greeting").textContent = "Welcome back, " + currentUser.name.split(" ")[0] + "!";

  const combined = [
    ...incomeList.map(e  => ({ type: "income",  data: e, d: new Date(e.date) })),
    ...expenseList.map(e => ({ type: "expense", data: e, d: new Date(e.date) }))
  ].sort((a, b) => b.d - a.d);

  const recentEl = document.getElementById("dash-recent");
  recentEl.innerHTML = "";
  if (combined.length === 0) {
    recentEl.innerHTML = '<p class="empty-msg">No activity yet. Add income or an expense to get started.</p>';
  } else {
    combined.slice(0, 6).forEach(item => recentEl.appendChild(item.type === "income" ? buildIncomeRow(item.data) : buildExpenseRow(item.data)));
  }

  const catsEl = document.getElementById("dash-cats");
  catsEl.innerHTML = "";
  renderCategoryRows(catsEl, getCategorySpending("", ""));
}

function renderIncomeHistory() {
  const month  = document.getElementById("inc-filter").value;
  const listEl = document.getElementById("inc-list");
  listEl.innerHTML = "";
  document.getElementById("inc-count").textContent = incomeList.length;
  const filtered = incomeList.filter(e => !month || e.date.substring(5,7) === month);
  if (filtered.length === 0) { listEl.innerHTML = '<p class="empty-msg">No income entries' + (month ? " for this month" : "") + '.</p>'; return; }
  filtered.forEach(e => listEl.appendChild(buildIncomeRow(e)));
}

function renderExpenseHistory() {
  const month  = document.getElementById("exp-filter").value;
  const listEl = document.getElementById("exp-list");
  listEl.innerHTML = "";
  document.getElementById("exp-count").textContent = expenseList.length;
  const filtered = expenseList.filter(e => !month || e.date.substring(5,7) === month);
  if (filtered.length === 0) { listEl.innerHTML = '<p class="empty-msg">No expenses' + (month ? " for this month" : "") + '.</p>'; return; }
  filtered.forEach(e => listEl.appendChild(buildExpenseRow(e)));
}

function renderBudget() {
  const totalExpenses = getTotal(expenseList, "", "");
  const remaining     = monthlyBudgetLimit - totalExpenses;
  const percent       = monthlyBudgetLimit > 0 ? Math.round((totalExpenses / monthlyBudgetLimit) * 100) : 0;

  let barColor = "#0fb56b", circleClass = "good", statusText = "You are within your budget.";
  if (percent >= 100)     { barColor = "#f7374f"; circleClass = "danger"; statusText = "You have exceeded your monthly budget!"; }
  else if (percent >= 80) { barColor = "#f59e0b"; circleClass = "warn";   statusText = "Getting close to your budget limit."; }

  const remainingText = remaining < 0
    ? '<p class="budget-remaining over">$' + Math.abs(remaining).toFixed(2) + ' over budget!</p>'
    : '<p style="font-size:13px;color:#9999b0;font-weight:600;">$' + remaining.toFixed(2) + ' remaining</p>';

  document.getElementById("budget-status-wrap").innerHTML =
    '<div class="budget-status-card' + (percent >= 100 ? " over" : "") + '">' +
      '<div class="budget-circle ' + circleClass + '">' + percent + '%</div>' +
      '<div class="budget-detail">' +
        '<h3>Monthly Budget: $' + monthlyBudgetLimit.toFixed(2) + '</h3>' +
        '<p>' + statusText + '</p>' + remainingText +
        '<div class="progress-bar-bg"><div class="progress-bar-fill" style="width:' + Math.min(percent,100) + '%;background:' + barColor + ';"></div></div>' +
        '<p class="budget-pct">$' + totalExpenses.toFixed(2) + ' spent of $' + monthlyBudgetLimit.toFixed(2) + '</p>' +
      '</div>' +
    '</div>';

  const catsEl = document.getElementById("budget-cats");
  catsEl.innerHTML = "";
  renderCategoryRows(catsEl, getCategorySpending("", ""));
}

function renderSummary() {
  const month = document.getElementById("sum-month").value;
  const year  = document.getElementById("sum-year").value;

  const totalIncome   = getTotal(incomeList, month, year);
  const totalExpenses = getTotal(expenseList, month, year);
  const balance       = totalIncome - totalExpenses;

  document.getElementById("sum-income").textContent   = "$" + totalIncome.toFixed(2);
  document.getElementById("sum-expenses").textContent = "$" + totalExpenses.toFixed(2);
  document.getElementById("sum-saved").textContent    = "$" + (balance > 0 ? balance : 0).toFixed(2);
  document.getElementById("sum-balance").textContent  = (balance < 0 ? "-$" + Math.abs(balance).toFixed(2) : "$" + balance.toFixed(2));

  const catsEl = document.getElementById("sum-cats");
  catsEl.innerHTML = "";
  renderCategoryRows(catsEl, getCategorySpending(month, year));
}

function renderAll() {
  renderDashboard();
  renderIncomeHistory();
  renderExpenseHistory();
  renderBudget();
  renderSummary();
}
