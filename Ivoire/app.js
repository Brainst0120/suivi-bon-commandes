const STORAGE_KEY = "ivoirePurchaseOrders";

const form = document.getElementById("orderForm");
const fields = {
  id: document.getElementById("orderId"),
  poNumber: document.getElementById("poNumber"),
  supplier: document.getElementById("supplier"),
  proformaDate: document.getElementById("proformaDate"),
  entryDate: document.getElementById("entryDate"),
  signatureDate: document.getElementById("signatureDate"),
  amountTtc: document.getElementById("amountTtc"),
  expenseNature: document.getElementById("expenseNature"),
  orderObject: document.getElementById("orderObject"),
  accountNumber: document.getElementById("accountNumber"),
  status: document.getElementById("status"),
};

const formatCurrency = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "XOF",
  maximumFractionDigits: 0,
});

function todayValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function getOrders() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
}

function saveOrders(orders) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

function normalizeText(value) {
  return value.trim().replace(/\s+/g, " ");
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR").format(new Date(`${value}T00:00:00`));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `bc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getFilteredOrders() {
  const search = document.getElementById("searchInput").value.trim().toLowerCase();
  const status = document.getElementById("statusFilter").value;

  return getOrders().filter((order) => {
    const matchesStatus = status === "all" || order.status === status;
    const haystack = [
      order.poNumber,
      order.supplier,
      order.expenseNature,
      order.orderObject,
      order.accountNumber,
      order.status,
      order.amountTtc,
    ]
      .join(" ")
      .toLowerCase();
    return matchesStatus && (!search || haystack.includes(search));
  });
}

function updateStats(orders) {
  const totalCommitments = orders.reduce((sum, order) => sum + Number(order.amountTtc || 0), 0);
  const suppliers = new Set(orders.map((order) => (order.supplier || "").toLowerCase()).filter(Boolean));
  const accounts = new Set(orders.map((order) => (order.accountNumber || "").toLowerCase()).filter(Boolean));
  const validated = orders.filter((order) => order.status === "Signé et Validé").length;

  document.getElementById("totalOrders").textContent = orders.length;
  document.getElementById("totalCommitments").textContent = formatCurrency.format(totalCommitments);
  document.getElementById("totalSuppliers").textContent = suppliers.size;
  document.getElementById("totalAccounts").textContent = accounts.size;
  document.getElementById("validatedOrders").textContent = validated;
  document.getElementById("monthlyChartTotal").textContent = formatCurrency.format(totalCommitments);
}

function summarizeByAccount(orders) {
  return Object.values(
    orders.reduce((acc, order) => {
      const account = order.accountNumber || "Non renseigné";
      const key = account.toLowerCase();
      if (!acc[key]) {
        acc[key] = {
          account,
          count: 0,
          total: 0,
          natures: new Set(),
        };
      }
      acc[key].count += 1;
      acc[key].total += Number(order.amountTtc || 0);
      if (order.expenseNature) acc[key].natures.add(order.expenseNature);
      return acc;
    }, {})
  )
    .map((item) => ({ ...item, natures: Array.from(item.natures) }))
    .sort((a, b) => b.total - a.total);
}

function summarizeByMonth(orders) {
  return Object.values(
    orders.reduce((acc, order) => {
      const sourceDate = order.entryDate || order.signatureDate || order.proformaDate;
      if (!sourceDate) return acc;
      const key = sourceDate.slice(0, 7);
      if (!acc[key]) {
        const [year, month] = key.split("-");
        acc[key] = {
          key,
          label: new Intl.DateTimeFormat("fr-FR", { month: "short", year: "2-digit" }).format(
            new Date(Number(year), Number(month) - 1, 1)
          ),
          total: 0,
        };
      }
      acc[key].total += Number(order.amountTtc || 0);
      return acc;
    }, {})
  ).sort((a, b) => a.key.localeCompare(b.key));
}

function renderSupplierSummary(orders) {
  const summary = orders.reduce((acc, order) => {
    const supplier = order.supplier || "Non renseigné";
    const key = supplier.toLowerCase();
    if (!acc[key]) {
      acc[key] = {
        supplier,
        count: 0,
        total: 0,
      };
    }
    acc[key].count += 1;
    acc[key].total += Number(order.amountTtc || 0);
    return acc;
  }, {});

  const rows = Object.values(summary).sort((a, b) => b.total - a.total);
  const container = document.getElementById("supplierSummary");

  if (!rows.length) {
    container.innerHTML = '<p class="muted">Aucun engagement fournisseur à afficher.</p>';
    return;
  }

  container.innerHTML = rows
    .map(
      (item) => `
        <article class="supplier-item">
          <div>
            <strong>${escapeHtml(item.supplier)}</strong>
            <p>${item.count} bon${item.count > 1 ? "s" : ""} de commande</p>
          </div>
          <span>${formatCurrency.format(item.total)}</span>
        </article>
      `
    )
    .join("");
}

function renderAccountSummary(orders) {
  const rows = summarizeByAccount(orders);
  const container = document.getElementById("accountSummary");

  if (!rows.length) {
    container.innerHTML = '<p class="muted">Aucun compte comptable à afficher.</p>';
    return;
  }

  container.innerHTML = rows
    .map((item) => {
      const natures = item.natures.length ? item.natures.join(", ") : "Nature non renseignée";
      return `
        <article class="account-item">
          <div>
            <strong>Compte ${escapeHtml(item.account)}</strong>
            <p>${item.count} engagement${item.count > 1 ? "s" : ""} | ${escapeHtml(natures)}</p>
          </div>
          <span>${formatCurrency.format(item.total)}</span>
        </article>
      `;
    })
    .join("");
}

function formatCompactAmount(value) {
  if (value >= 1000000) return `${Math.round(value / 1000000)} M`;
  if (value >= 1000) return `${Math.round(value / 1000)} k`;
  return String(Math.round(value));
}

function resizeCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;
  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { context, width, height };
}

function clearChart(canvasId, emptyId, hasData) {
  const canvas = document.getElementById(canvasId);
  const empty = document.getElementById(emptyId);
  if (!canvas || typeof canvas.getContext !== "function") return null;
  empty.hidden = hasData;
  canvas.hidden = !hasData;
  return hasData ? resizeCanvas(canvas) : null;
}

function drawBarChart(canvasId, emptyId, items, options = {}) {
  const chart = clearChart(canvasId, emptyId, items.length > 0);
  if (!chart) return;

  const { context, width, height } = chart;
  const padding = { top: 18, right: 20, bottom: 48, left: 58 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...items.map((item) => item.total), 1);
  const barGap = 14;
  const barWidth = Math.max(24, (chartWidth - barGap * (items.length - 1)) / items.length);

  context.clearRect(0, 0, width, height);
  context.strokeStyle = "#d9e0e8";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(padding.left, padding.top);
  context.lineTo(padding.left, padding.top + chartHeight);
  context.lineTo(padding.left + chartWidth, padding.top + chartHeight);
  context.stroke();

  context.fillStyle = "#667085";
  context.font = "12px Manrope, sans-serif";
  context.textAlign = "right";
  context.fillText(formatCompactAmount(maxValue), padding.left - 8, padding.top + 6);
  context.fillText("0", padding.left - 8, padding.top + chartHeight);

  items.forEach((item, index) => {
    const x = padding.left + index * (barWidth + barGap);
    const barHeight = Math.max(4, (item.total / maxValue) * chartHeight);
    const y = padding.top + chartHeight - barHeight;

    context.fillStyle = options.color || "#0f9f6e";
    context.fillRect(x, y, barWidth, barHeight);
    context.fillStyle = "#17202a";
    context.textAlign = "center";
    context.font = "12px Manrope, sans-serif";
    context.fillText(item.label || item.account, x + barWidth / 2, padding.top + chartHeight + 22);
  });
}

function renderCharts(orders) {
  drawBarChart("monthlyChart", "monthlyChartEmpty", summarizeByMonth(orders), { color: "#1f5eff" });
  drawBarChart(
    "accountChart",
    "accountChartEmpty",
    summarizeByAccount(orders)
      .slice(0, 8)
      .map((item) => ({ ...item, label: item.account })),
    { color: "#0f9f6e" }
  );
}

function statusClass(status) {
  if (status === "Signé et Validé") return "is-valid";
  if (status === "Annulé") return "is-cancelled";
  if (status === "En attente de signature") return "is-pending";
  return "is-draft";
}

function renderTable() {
  const filteredOrders = getFilteredOrders();
  const tbody = document.getElementById("ordersTable");
  const emptyState = document.getElementById("emptyState");

  tbody.innerHTML = filteredOrders
    .map(
      (order) => `
        <tr>
          <td><strong>${escapeHtml(order.poNumber)}</strong></td>
          <td>${escapeHtml(order.supplier)}</td>
          <td>${formatDate(order.proformaDate)}</td>
          <td>${formatDate(order.entryDate)}</td>
          <td>${formatDate(order.signatureDate)}</td>
          <td class="amount-cell">${formatCurrency.format(Number(order.amountTtc || 0))}</td>
          <td>${escapeHtml(order.expenseNature || "-")}</td>
          <td>${escapeHtml(order.orderObject)}</td>
          <td>${escapeHtml(order.accountNumber)}</td>
          <td><span class="status-pill ${statusClass(order.status)}">${escapeHtml(order.status)}</span></td>
          <td>
            <div class="row-actions">
              <button type="button" data-action="edit" data-id="${order.id}" title="Modifier">Modifier</button>
              <button type="button" data-action="delete" data-id="${order.id}" title="Supprimer">Supprimer</button>
            </div>
          </td>
        </tr>
      `
    )
    .join("");

  emptyState.hidden = filteredOrders.length > 0;
}

function renderApp() {
  const orders = getOrders();
  updateStats(orders);
  renderSupplierSummary(orders);
  renderAccountSummary(orders);
  renderCharts(orders);
  renderTable();
}

function clearForm() {
  form.reset();
  fields.id.value = "";
  fields.entryDate.value = todayValue();
  fields.status.value = "Signé et Validé";
  document.getElementById("formTitle").textContent = "Enregistrer un bon de commande";
  document.getElementById("submitOrder").textContent = "Enregistrer";
}

function fillForm(order) {
  fields.id.value = order.id;
  fields.poNumber.value = order.poNumber;
  fields.supplier.value = order.supplier;
  fields.proformaDate.value = order.proformaDate;
  fields.entryDate.value = order.entryDate;
  fields.signatureDate.value = order.signatureDate || "";
  fields.amountTtc.value = order.amountTtc;
  fields.expenseNature.value = order.expenseNature || "";
  fields.orderObject.value = order.orderObject;
  fields.accountNumber.value = order.accountNumber;
  fields.status.value = order.status;
  document.getElementById("formTitle").textContent = "Modifier le bon de commande";
  document.getElementById("submitOrder").textContent = "Mettre à jour";
  document.getElementById("saisie").scrollIntoView({ behavior: "smooth", block: "start" });
}

function buildOrderFromForm() {
  return {
    id: fields.id.value || createId(),
    poNumber: normalizeText(fields.poNumber.value),
    supplier: normalizeText(fields.supplier.value),
    proformaDate: fields.proformaDate.value,
    entryDate: fields.entryDate.value,
    signatureDate: fields.signatureDate.value,
    amountTtc: Number(fields.amountTtc.value),
    expenseNature: normalizeText(fields.expenseNature.value),
    orderObject: normalizeText(fields.orderObject.value),
    accountNumber: normalizeText(fields.accountNumber.value),
    status: fields.status.value,
    updatedAt: new Date().toISOString(),
  };
}

function upsertOrder(order) {
  const orders = getOrders();
  const duplicate = orders.find(
    (item) => item.poNumber.toLowerCase() === order.poNumber.toLowerCase() && item.id !== order.id
  );

  if (duplicate) {
    alert("Ce numéro de bon de commande existe déjà.");
    return false;
  }

  const index = orders.findIndex((item) => item.id === order.id);
  if (index >= 0) {
    orders[index] = order;
  } else {
    orders.unshift({ ...order, createdAt: new Date().toISOString() });
  }
  saveOrders(orders);
  return true;
}

function exportToExcel() {
  const orders = getFilteredOrders();
  if (!orders.length) {
    alert("Aucune donnée à exporter.");
    return;
  }

  const headers = [
    "Numéro du Bon de Commande",
    "Nom du Fournisseur",
    "Date facture proforma saisie",
    "Date de saisie du bon de commande",
    "Date de Signature du bon de commande",
    "Montant Total TTC",
    "Nature de la dépense",
    "Objet de la commande",
    "Numéro de compte",
    "Statut",
  ];

  const rows = orders.map((order) => [
    order.poNumber,
    order.supplier,
    formatDate(order.proformaDate),
    formatDate(order.entryDate),
    formatDate(order.signatureDate),
    Number(order.amountTtc || 0),
    order.expenseNature || "",
    order.orderObject,
    order.accountNumber,
    order.status,
  ]);

  const table = `
    <html>
      <head><meta charset="utf-8" /></head>
      <body>
        <table border="1">
          <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
          <tbody>
            ${rows
              .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
              .join("")}
          </tbody>
        </table>
      </body>
    </html>
  `;

  const blob = new Blob([table], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `suivi-bons-commande-${todayValue()}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const order = buildOrderFromForm();
  if (upsertOrder(order)) {
    clearForm();
    renderApp();
  }
});

document.getElementById("resetForm").addEventListener("click", clearForm);
document.getElementById("searchInput").addEventListener("input", renderTable);
document.getElementById("statusFilter").addEventListener("change", renderTable);
document.getElementById("exportExcel").addEventListener("click", exportToExcel);
document.getElementById("exportExcelHero").addEventListener("click", exportToExcel);
window.addEventListener("resize", () => renderCharts(getOrders()));

document.getElementById("ordersTable").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const orders = getOrders();
  const order = orders.find((item) => item.id === button.dataset.id);
  if (!order) return;

  if (button.dataset.action === "edit") {
    fillForm(order);
    return;
  }

  if (confirm(`Supprimer le bon de commande ${order.poNumber} ?`)) {
    saveOrders(orders.filter((item) => item.id !== order.id));
    renderApp();
  }
});

clearForm();
renderApp();
