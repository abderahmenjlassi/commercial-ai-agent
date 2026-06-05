// ── Config ─────────────────────────────────────────────────────────────────
marked.setOptions({ breaks: true, gfm: true });

const chatBody     = document.getElementById("chat-body");
const input        = document.getElementById("message-input");
const sendBtn      = document.getElementById("send-btn");
const statusEl     = document.getElementById("agent-status");
const statusDot    = document.getElementById("status-dot");
const quickReplies = document.getElementById("quick-replies");

let sessionId      = localStorage.getItem("session_id") || null;
let knownPhone     = localStorage.getItem("customer_phone") || null;
let isIdentified   = false;

// ── Helpers ─────────────────────────────────────────────────────────────────

function currentTime() {
  return new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
function scrollToBottom() { chatBody.scrollTop = chatBody.scrollHeight; }

function setQuickReplies(chips) {
  quickReplies.innerHTML = "";
  (chips || []).forEach(label => {
    const btn = document.createElement("button");
    btn.className = "quick-reply-chip";
    btn.textContent = label;
    btn.addEventListener("click", () => {
      quickReplies.innerHTML = "";
      sendText(label);
    });
    quickReplies.appendChild(btn);
  });
}

// ── Message rendering ────────────────────────────────────────────────────────

function appendMessage(text, role, extraEl = null) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = marked.parse(text);

  const time = document.createElement("span");
  time.className = "time";
  time.textContent = currentTime();
  bubble.appendChild(time);

  wrapper.appendChild(bubble);
  if (extraEl) wrapper.appendChild(extraEl);
  chatBody.appendChild(wrapper);
  scrollToBottom();
}

// ── Product card builders ────────────────────────────────────────────────────

function buildProductCards(products) {
  if (!products || products.length === 0) return null;
  const container = document.createElement("div");
  container.className = "product-cards";

  products.forEach(p => {
    const card = document.createElement("div");
    card.className = "product-card";

    const img = document.createElement("img");
    img.src = p.photo || p.photo_thumb || "";
    img.alt = p.name;
    img.onerror = () => { img.style.display = "none"; };

    const body = document.createElement("div");
    body.className = "product-card-body";

    const name = document.createElement("div");
    name.className = "product-card-name";
    name.textContent = p.name;

    const priceRow = document.createElement("div");
    priceRow.className = "product-card-price";
    const priceFinal = p.price_final ?? p.final_price ?? p.price;
    const priceOrig  = p.price_original ?? p.price;

    const pNew = document.createElement("span");
    pNew.className = "price-new";
    pNew.textContent = `${priceFinal} TND`;
    priceRow.appendChild(pNew);

    if (p.has_discount && priceOrig !== priceFinal) {
      const pOld = document.createElement("span");
      pOld.className = "price-old";
      pOld.textContent = `${priceOrig} TND`;
      priceRow.appendChild(pOld);
    }

    const stockBadge = document.createElement("span");
    const inStock = p.in_stock ?? (p.stock > 0);
    stockBadge.className = `stock-badge ${inStock ? "in" : "out"}`;
    stockBadge.textContent = inStock ? `En stock (${p.stock})` : "Rupture";

    const actions = document.createElement("div");
    actions.className = "product-card-actions";

    const btnDetails = document.createElement("button");
    btnDetails.className = "btn-card btn-details";
    btnDetails.textContent = "Détails";
    btnDetails.addEventListener("click", () => {
      quickReplies.innerHTML = "";
      sendText(`Donne-moi les détails du produit ${p.id}`);
    });

    const btnOrder = document.createElement("button");
    btnOrder.className = "btn-card btn-order";
    btnOrder.textContent = "Commander";
    btnOrder.addEventListener("click", () => {
      quickReplies.innerHTML = "";
      sendText(`Je veux commander le produit : ${p.name} (ID ${p.id})`);
    });

    actions.appendChild(btnDetails);
    actions.appendChild(btnOrder);
    body.appendChild(name);
    body.appendChild(priceRow);
    body.appendChild(stockBadge);
    body.appendChild(actions);
    card.appendChild(img);
    card.appendChild(body);
    container.appendChild(card);
  });

  return container;
}

function buildProductDetail(p) {
  if (!p) return null;
  const card = document.createElement("div");
  card.className = "product-detail-card";

  if (p.photo) {
    const img = document.createElement("img");
    img.src = p.photo; img.alt = p.name;
    img.onerror = () => { img.style.display = "none"; };
    card.appendChild(img);
  }

  const body = document.createElement("div");
  body.className = "product-detail-body";

  const name = document.createElement("div");
  name.className = "product-detail-name";
  name.textContent = p.name;

  const meta = document.createElement("div");
  meta.className = "product-detail-meta";
  const priceFinal = p.price_final ?? p.final_price ?? p.price;
  const priceOrig  = p.price_original ?? p.price;
  const pNew = document.createElement("span");
  pNew.className = "price-new";
  pNew.textContent = `${priceFinal} TND`;
  meta.appendChild(pNew);
  if (p.has_discount && priceOrig !== priceFinal) {
    const pOld = document.createElement("span");
    pOld.className = "price-old";
    pOld.textContent = `${priceOrig} TND`;
    meta.appendChild(pOld);
  }
  const stockBadge = document.createElement("span");
  const inStock = p.in_stock ?? (p.stock > 0);
  stockBadge.className = `stock-badge ${inStock ? "in" : "out"}`;
  stockBadge.textContent = inStock ? `En stock (${p.stock})` : "Rupture de stock";
  meta.appendChild(stockBadge);

  const desc = document.createElement("div");
  desc.className = "product-detail-desc";
  desc.textContent = p.description || "";

  const actions = document.createElement("div");
  actions.className = "detail-btn-row";
  const btnOrder = document.createElement("button");
  btnOrder.className = "btn-card btn-order";
  btnOrder.style.flex = "1";
  btnOrder.textContent = "Commander ce produit";
  btnOrder.addEventListener("click", () => {
    quickReplies.innerHTML = "";
    sendText(`Je veux commander le produit : ${p.name} (ID ${p.id})`);
  });
  actions.appendChild(btnOrder);

  body.appendChild(name);
  body.appendChild(meta);
  body.appendChild(desc);
  body.appendChild(actions);
  card.appendChild(body);
  return card;
}

// ── Customer profile card ─────────────────────────────────────────────────────

function buildCustomerCard(c) {
  if (!c || (!c.found && !c.known)) return null;

  const tagClass = {
    "Nouveau client":  "tag-new",
    "Client régulier": "tag-regular",
    "Client fidèle":   "tag-loyal",
    "Client VIP":      "tag-vip",
    "Client à risque": "tag-risk",
  }[c.tag || c.customer?.tag] || "tag-new";

  const name   = c.customer_name || c.name || c.phone || "Client";
  const tag    = c.tag || "";
  const phone  = c.phone || "";
  const orders = c.total_orders || 0;
  const spent  = c.total_spent  || 0;
  const deliv  = c.delivered_orders || 0;
  const initials = name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase();

  const card = document.createElement("div");
  card.className = "customer-card";
  card.innerHTML = `
    <div class="customer-card-header">
      <div class="customer-avatar">${initials || "👤"}</div>
      <div>
        <div class="customer-name">${name}</div>
        <div class="customer-phone">${phone}</div>
      </div>
      ${tag ? `<span class="customer-tag ${tagClass}">${tag}</span>` : ""}
    </div>
    <div class="customer-stats">
      <div class="cstat"><div class="cstat-num">${orders}</div><div class="cstat-label">Commandes</div></div>
      <div class="cstat"><div class="cstat-num">${spent}</div><div class="cstat-label">TND dépensés</div></div>
      <div class="cstat"><div class="cstat-num">${deliv}</div><div class="cstat-label">Livrées</div></div>
    </div>
    ${(c.bought_products && c.bought_products.length) ? `
    <div class="customer-history">
      <div class="customer-history-title">Achats précédents</div>
      ${c.bought_products.map(p => `<span class="bought-chip">${p.slice(0,30)}</span>`).join("")}
    </div>` : ""}`;
  return card;
}

// ── Order recap card ─────────────────────────────────────────────────────────

function buildOrderRecap(recap) {
  if (!recap || !recap.recap_ready) return null;

  const card = document.createElement("div");
  card.className = "order-recap-card";

  const header = document.createElement("div");
  header.className = "order-recap-header";
  header.innerHTML = `
    <span class="icon">🛒</span>
    <div>
      <div class="title">Récapitulatif de commande</div>
      <div class="subtitle">Vérifiez vos informations avant de confirmer</div>
    </div>`;
  card.appendChild(header);

  const itemsEl = document.createElement("div");
  itemsEl.className = "order-recap-items";
  (recap.items || []).forEach(item => {
    const row = document.createElement("div");
    row.className = "recap-item";
    row.innerHTML = `
      <img src="${item.photo || ""}" alt="${item.name}" onerror="this.style.display='none'">
      <div class="recap-item-info">
        <div class="recap-item-name">${item.name}</div>
        <div class="recap-item-qty">Qté : ${item.quantity}</div>
      </div>
      <div class="recap-item-price">${item.line_total} TND</div>`;
    itemsEl.appendChild(row);
  });
  card.appendChild(itemsEl);

  const delivery = document.createElement("div");
  delivery.className = "order-recap-delivery";
  delivery.innerHTML = `
    <div class="recap-field"><span class="recap-field-label">Client</span><span class="recap-field-value">${recap.customer_name}</span></div>
    <div class="recap-field"><span class="recap-field-label">Téléphone</span><span class="recap-field-value">${recap.phone}</span></div>
    <div class="recap-field" style="grid-column:1/-1"><span class="recap-field-label">Adresse</span><span class="recap-field-value">${recap.address}, ${recap.gouvernorat}</span></div>
    <div class="recap-field"><span class="recap-field-label">Paiement</span><span class="recap-field-value">${recap.payement_type || "CASH"}</span></div>`;
  card.appendChild(delivery);

  const totalRow = document.createElement("div");
  totalRow.className = "order-recap-total";
  totalRow.innerHTML = `<span class="recap-total-label">Total</span><span class="recap-total-amount">${recap.total} TND</span>`;
  card.appendChild(totalRow);

  const actions = document.createElement("div");
  actions.className = "order-recap-actions";

  const btnConfirm = document.createElement("button");
  btnConfirm.className = "btn-confirm";
  btnConfirm.textContent = "✓ Confirmer la commande";
  btnConfirm.addEventListener("click", () => {
    quickReplies.innerHTML = "";
    btnConfirm.disabled = true;
    btnModify.disabled = true;
    btnConfirm.textContent = "En cours...";
    sendText("Oui, je confirme la commande.");
  });

  const btnModify = document.createElement("button");
  btnModify.className = "btn-modify";
  btnModify.textContent = "✏ Modifier";
  btnModify.addEventListener("click", () => {
    quickReplies.innerHTML = "";
    sendText("Je veux modifier ma commande.");
  });

  actions.appendChild(btnConfirm);
  actions.appendChild(btnModify);
  card.appendChild(actions);
  return card;
}

// ── Order success card ────────────────────────────────────────────────────────

function buildOrderSuccess(order) {
  if (!order || !order.success) return null;
  const card = document.createElement("div");
  card.className = "order-success-card";
  card.innerHTML = `
    <div class="order-success-header">
      <span class="check">✅</span>
      <div class="title">Commande confirmée !</div>
      <div class="subtitle">Vous recevrez un appel de confirmation sous peu</div>
    </div>
    <div class="order-success-body">
      <div class="success-row"><span class="success-label">Numéro de commande</span><span class="success-value order-id">#${order.order_id}</span></div>
      <div class="success-row"><span class="success-label">Statut</span><span class="success-value">${order.status || "En attente"}</span></div>
      <div class="success-row"><span class="success-label">Montant total</span><span class="success-value">${order.total || "—"} TND</span></div>
    </div>`;
  return card;
}

// ── Delivery / Invoice / Quote cards ─────────────────────────────────────────

function buildDeliveryCard(d) {
  if (!d) return null;
  const card = document.createElement("div");
  card.className = "delivery-card";
  if (d.gouvernorat && d.covered !== undefined) {
    card.innerHTML = `
      <div class="delivery-header"><span class="icon">🚚</span>
        <div><div class="title">Livraison — ${d.gouvernorat}</div><div class="sub">JAX Delivery</div></div>
      </div>
      <div class="delivery-zones">
        <div class="delivery-zone-row">
          <div><div class="zone-label">${d.covered ? `Délai : ${d.delay}` : "Non couvert"}</div>
            <div class="zone-govs">${d.covered ? d.payment : d.message}</div></div>
          ${d.covered ? `<span class="zone-cost">${d.cost} TND</span>` : ""}
        </div>
      </div>`;
    return card;
  }
  const zones = d.zones || {};
  const rows = Object.entries(zones).map(([label, govs]) => `
    <div class="delivery-zone-row">
      <div><div class="zone-label">${label.split("(")[0].trim()}</div>
        <div class="zone-govs">${govs.join(", ")}</div></div>
      <span class="zone-cost">${label.match(/\d+ TND/) ? label.match(/\d+ TND/)[0] : ""}</span>
    </div>`).join("");
  card.innerHTML = `
    <div class="delivery-header"><span class="icon">🚚</span>
      <div><div class="title">Informations de livraison</div>
        <div class="sub">${d.transporter || "JAX Delivery"} · ${d.working_days || ""}</div></div>
    </div>
    <div class="delivery-zones">${rows}</div>
    <div class="delivery-footer"><span>💳 ${d.payment || ""}</span>${d.note ? `<span>ℹ️ ${d.note}</span>` : ""}</div>`;
  return card;
}

function buildInvoiceCard(inv) {
  if (!inv || !inv.found) return null;
  const card = document.createElement("div");
  card.className = "invoice-card";
  const isPaid = inv.is_paid;
  const rows = (inv.items || []).map(i => `
    <tr><td>${i.product_name||i.name||"—"}</td>
    <td style="text-align:center">${i.quantity}</td>
    <td style="text-align:right">${i.price_ttc||i.price_unit||0} TND</td>
    <td style="text-align:right;color:#00a884;font-weight:700">${i.final_price||i.line_ttc||0} TND</td></tr>`).join("");
  const label = inv.invoice_number ? `Facture N° ${inv.invoice_number}` : `Reçu commande #${inv.order_id}`;
  card.innerHTML = `
    <div class="invoice-header">
      <div><div class="invoice-title">${label}</div>
        <div class="invoice-ref">Commande #${inv.order_id||"—"} · ${inv.date||""}</div></div>
      <span class="invoice-status ${isPaid?"inv-paid":"inv-unpaid"}">${isPaid?"Payée":"Non payée"}</span>
    </div>
    <div class="invoice-meta">
      <div><div class="invoice-field-label">Client</div><div class="invoice-field-value">${inv.customer_name||"—"}</div></div>
      <div><div class="invoice-field-label">Téléphone</div><div class="invoice-field-value">${inv.phone||"—"}</div></div>
      <div style="grid-column:1/-1"><div class="invoice-field-label">Adresse</div><div class="invoice-field-value">${inv.address||"—"}</div></div>
      <div><div class="invoice-field-label">Paiement</div><div class="invoice-field-value">${inv.payment_type||"CASH"}</div></div>
      <div><div class="invoice-field-label">Statut</div><div class="invoice-field-value">${inv.status||"—"}</div></div>
    </div>
    <div class="invoice-items">
      <table class="inv-table">
        <thead><tr><th>Produit</th><th style="text-align:center">Qté</th><th style="text-align:right">Prix TTC</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
    <div class="invoice-total"><span class="inv-total-label">Total</span><span class="inv-total-amount">${inv.total} TND</span></div>`;
  return card;
}

function buildQuoteCard(q) {
  if (!q || !q.quote_ready) return null;
  const card = document.createElement("div");
  card.className = "quote-card";
  const rows = (q.lines || []).map(l => `
    <tr><td>${l.name.slice(0,40)}</td>
    <td style="text-align:center">${l.quantity}</td>
    <td style="text-align:right">${l.price_unit} TND</td>
    <td style="text-align:right;color:#00a884;font-weight:700">${l.line_ttc} TND</td></tr>`).join("");
  card.innerHTML = `
    <div class="quote-header">
      <div><div class="quote-title">📋 Devis ${q.customer_name ? "— " + q.customer_name : ""}</div>
        <div class="quote-ref">${q.quote_ref}</div></div>
      <div class="quote-validity"><div>${q.date}</div><div>Valide jusqu'au <strong>${q.validity}</strong></div></div>
    </div>
    <div class="quote-items">
      <table class="inv-table">
        <thead><tr><th>Produit</th><th style="text-align:center">Qté</th><th style="text-align:right">Prix unit.</th><th style="text-align:right">Total TTC</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
    <div class="quote-total">
      <div class="quote-total-row"><span class="qt-label">Total HT</span><span class="qt-value">${q.total_ht} TND</span></div>
      <div class="quote-total-row"><span class="qt-label">TVA</span><span class="qt-value">${q.tva_amount} TND</span></div>
      <div class="quote-total-row"><span class="qt-label">Total TTC</span><span class="qt-value final">${q.total_ttc} TND</span></div>
    </div>
    <div class="quote-actions">
      <button class="btn-quote-order" onclick="sendText('Je veux commander les produits de ce devis')">Commander ce devis</button>
    </div>`;
  return card;
}

// ── Typing indicator ─────────────────────────────────────────────────────────

function showTyping() {
  const el = document.createElement("div");
  el.className = "message agent";
  el.id = "typing-msg";
  el.innerHTML = `<div class="typing-indicator"><span></span><span></span><span></span></div>`;
  chatBody.appendChild(el);
  scrollToBottom();
  statusEl.textContent = "en train d'écrire...";
  statusDot.classList.add("typing");
}
function hideTyping() {
  const el = document.getElementById("typing-msg");
  if (el) el.remove();
  statusEl.textContent = "En ligne";
  statusDot.classList.remove("typing");
}
function setLoading(state) {
  sendBtn.disabled = state;
  input.disabled   = state;
}

// ── Header update ─────────────────────────────────────────────────────────────

function updateHeader(ctx) {
  if (!ctx || !ctx.known) return;
  const name    = (ctx.name || "").split(" ")[0];
  const titleEl = document.querySelector(".name");
  const subEl   = document.querySelector(".status");
  if (titleEl && name) {
    titleEl.textContent = `TuniOptique · ${name}`;
  }
  if (subEl && ctx.tag) {
    const tagColor = {
      "Client VIP":"#bc8cff","Client fidèle":"#e3b341",
      "Client régulier":"#3fb950","Nouveau client":"#58a6ff","Client à risque":"#f85149"
    }[ctx.tag] || "#00a884";
    subEl.innerHTML = `<span class="status-dot"></span> <span style="color:${tagColor}">${ctx.tag}</span>`;
  }
}

// ── Session ──────────────────────────────────────────────────────────────────

async function initSession() {
  // Retrieve saved session + phone from localStorage
  const savedPhone = localStorage.getItem("customer_phone") || null;

  if (sessionId) {
    // Resuming existing session — just show placeholder greeting
    appendMessage("Bonjour ! Je suis l'assistant de TuniOptique. Comment puis-je vous aider ?", "agent");
    if (savedPhone) {
      setQuickReplies(["Mes commandes", "Chercher un produit", "Livraison", "Aide"]);
    } else {
      setQuickReplies(["Voir les catégories", "Chercher un produit", "Suivre ma commande", "Recommandez-moi quelque chose"]);
    }
    return;
  }

  // New session
  setLoading(true);
  showTyping();
  try {
    const body = savedPhone ? { phone: savedPhone } : {};
    const res  = await fetch("/api/session/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();

    sessionId = data.session_id;
    localStorage.setItem("session_id", sessionId);

    hideTyping();

    const greeting = data.greeting || "Bonjour ! Comment puis-je vous aider ?";
    const ctx      = data.customer;

    if (ctx && ctx.known) {
      isIdentified = true;
      updateHeader(ctx);
      appendMessage(greeting, "agent", buildCustomerCard(ctx));
      // Context-aware quick replies based on proactive action
      const proactive = ctx.proactive || {};
      const chips = _proactiveChips(proactive);
      setQuickReplies(chips);
    } else {
      appendMessage(greeting, "agent");
      setQuickReplies(["Voir les catégories", "Chercher un produit", "Suivre ma commande", "Passer une commande"]);
    }
  } catch(e) {
    hideTyping();
    appendMessage("Bonjour ! Comment puis-je vous aider ?", "agent");
  } finally {
    setLoading(false);
  }
}

function _proactiveChips(proactive) {
  const type = proactive.type || "welcome";
  const map = {
    "tracking":      ["Suivre ma commande", "Autre commande", "Parcourir les produits"],
    "order_waiting": ["Statut de ma commande", "Commander un produit", "Aide"],
    "order_pending": ["Confirmer ma commande", "Annuler la commande", "Parcourir les produits"],
    "feedback":      ["Commande reçue ✓", "J'ai un problème", "Voir les accessoires"],
    "upsell":        ["Voir les produits complémentaires", "Passer une commande", "Voir le catalogue"],
    "welcome":       ["Voir les catégories", "Chercher un produit", "Passer une commande", "Livraison"],
  };
  return map[type] || map["welcome"];
}

async function resetSession() {
  localStorage.removeItem("session_id");
  sessionId = null;
  chatBody.innerHTML = "";
  quickReplies.innerHTML = "";
  const headerTitle = document.querySelector(".name");
  const headerStatus = document.querySelector(".status");
  if (headerTitle) headerTitle.textContent = "TuniOptique — Assistant";
  if (headerStatus) headerStatus.innerHTML = `<span class="status-dot" id="status-dot"></span><span id="agent-status">En ligne</span>`;
  await initSession();
}

// ── Send ─────────────────────────────────────────────────────────────────────

async function sendText(text) {
  if (!text.trim() || sendBtn.disabled) return;
  appendMessage(text, "user");
  setLoading(true);
  showTyping();
  quickReplies.innerHTML = "";

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, session_id: sessionId })
    });
    const data = await res.json();
    hideTyping();

    if (data.error) {
      appendMessage("Une erreur est survenue. Veuillez réessayer.", "agent");
      return;
    }

    sessionId = data.session_id;
    localStorage.setItem("session_id", sessionId);

    // Save phone to localStorage if customer was just identified
    if (data.customer && (data.customer.phone || data.customer.found)) {
      const phone = data.customer.phone;
      if (phone && !localStorage.getItem("customer_phone")) {
        localStorage.setItem("customer_phone", phone);
        updateHeader(data.customer);
        isIdentified = true;
      }
    }

    // Build extra UI element
    let extraEl = null;
    if (data.order_result && data.order_result.success) {
      extraEl = buildOrderSuccess(data.order_result);
    } else if (data.order_recap && data.order_recap.recap_ready) {
      extraEl = buildOrderRecap(data.order_recap);
    } else if (data.customer) {
      extraEl = buildCustomerCard(data.customer);
    } else if (data.invoice) {
      extraEl = buildInvoiceCard(data.invoice);
    } else if (data.quote) {
      extraEl = buildQuoteCard(data.quote);
    } else if (data.delivery) {
      extraEl = buildDeliveryCard(data.delivery);
    } else if (data.products && data.products.length > 0) {
      extraEl = buildProductCards(data.products);
    } else if (data.product) {
      extraEl = buildProductDetail(data.product);
    }

    appendMessage(data.reply, "agent", extraEl);

    // Context-aware quick replies
    if (data.order_result && data.order_result.success) {
      setQuickReplies(["Suivre ma commande", "Passer une autre commande", "Merci !"]);
    } else if (data.order_recap && data.order_recap.recap_ready) {
      setQuickReplies([]);
    } else if (data.customer) {
      const proactive = data.customer.proactive || {};
      setQuickReplies(_proactiveChips(proactive));
    } else if (data.products && data.products.length > 0) {
      setQuickReplies(["Comparer des produits", "Commander un produit", "Autre catégorie"]);
    } else if (data.product) {
      setQuickReplies(["Commander ce produit", "Voir des alternatives", "Poser une question"]);
    }

  } catch (err) {
    hideTyping();
    appendMessage("Impossible de joindre le serveur. Vérifiez votre connexion.", "agent");
  } finally {
    setLoading(false);
    input.focus();
  }
}

async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  input.style.height = "auto";
  await sendText(text);
}

// ── Event listeners ──────────────────────────────────────────────────────────

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 120) + "px";
});
input.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
sendBtn.addEventListener("click", sendMessage);
document.getElementById("new-chat-btn").addEventListener("click", () => {
  if (confirm("Démarrer une nouvelle conversation ?")) resetSession();
});

// ── Init ─────────────────────────────────────────────────────────────────────
initSession();
