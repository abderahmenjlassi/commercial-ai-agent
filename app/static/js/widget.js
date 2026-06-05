/**
 * TuniOptique Chat Widget
 * Embeddable plugin for the TuniOptique website.
 *
 * Usage:
 *   <script src="https://your-server.com/static/js/widget.js"
 *           data-server="https://your-server.com"
 *           data-color="#00a884"
 *           data-position="bottom-right">
 *   </script>
 *
 * data-server   : Base URL of the Flask chat server (default: same origin)
 * data-color    : Brand color for the chat button (default: #00a884)
 * data-position : "bottom-right" | "bottom-left" (default: "bottom-right")
 */
(function () {
  "use strict";

  // ── Configuration ────────────────────────────────────────────────────────

  var _script   = document.currentScript;
  var SERVER    = (_script && _script.getAttribute("data-server")) || window.location.origin;
  var COLOR     = (_script && _script.getAttribute("data-color"))  || "#00a884";
  var POSITION  = (_script && _script.getAttribute("data-position")) || "bottom-right";

  var VISITOR_KEY  = "tuno_vid";
  var PHONE_KEY    = "customer_phone";
  var OPEN_KEY     = "tuno_widget_open";

  // ── Visitor ID ───────────────────────────────────────────────────────────

  function _genId() {
    return "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  var visitorId = localStorage.getItem(VISITOR_KEY);
  if (!visitorId) {
    visitorId = _genId();
    localStorage.setItem(VISITOR_KEY, visitorId);
  }

  // ── Register visitor with backend ────────────────────────────────────────

  function _registerVisitor() {
    var payload = {
      visitor_id: visitorId,
      referrer:   document.referrer || "",
      user_agent: navigator.userAgent,
      page:       window.location.pathname + window.location.search,
    };
    fetch(SERVER + "/api/visitor/init", {
      method:      "POST",
      headers:     { "Content-Type": "application/json" },
      credentials: "include",
      body:        JSON.stringify(payload),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        // If the backend recognizes this visitor as an identified customer,
        // cache the phone in the parent page's localStorage for future sessions.
        if (data.customer_phone && !localStorage.getItem(PHONE_KEY)) {
          localStorage.setItem(PHONE_KEY, data.customer_phone);
        }
      })
      .catch(function () {});
  }

  // ── Inject styles ────────────────────────────────────────────────────────

  var _isRight = POSITION !== "bottom-left";

  function _injectStyles() {
    var side   = _isRight ? "right" : "left";
    var css    = [
      "#tuno-btn{",
        "position:fixed;bottom:20px;" + side + ":20px;",
        "width:56px;height:56px;border-radius:50%;",
        "background:" + COLOR + ";border:none;cursor:pointer;",
        "box-shadow:0 4px 16px rgba(0,0,0,.35);",
        "display:flex;align-items:center;justify-content:center;",
        "z-index:2147483646;transition:transform .2s,box-shadow .2s;",
        "padding:0;outline:none;",
      "}",
      "#tuno-btn:hover{transform:scale(1.08);box-shadow:0 6px 22px rgba(0,0,0,.45)}",
      "#tuno-btn svg{width:28px;height:28px;fill:#fff;pointer-events:none}",
      "#tuno-badge{",
        "position:absolute;top:-4px;" + (_isRight ? "right" : "left") + ":-4px;",
        "width:18px;height:18px;background:#ff3b30;",
        "border-radius:50%;border:2px solid #fff;",
        "font-size:10px;color:#fff;line-height:14px;text-align:center;",
        "display:none;",
      "}",
      "#tuno-panel{",
        "position:fixed;bottom:88px;" + side + ":20px;",
        "width:390px;height:620px;",
        "border-radius:16px;overflow:hidden;",
        "box-shadow:0 8px 40px rgba(0,0,0,.45);",
        "z-index:2147483645;border:1px solid rgba(255,255,255,.08);",
        "display:none;opacity:0;transform:translateY(12px);",
        "transition:opacity .22s,transform .22s;",
      "}",
      "#tuno-panel.tuno-open{display:block;opacity:1;transform:translateY(0)}",
      "#tuno-panel iframe{width:100%;height:100%;border:none;display:block}",
      "@media(max-width:480px){",
        "#tuno-panel{width:100vw;height:100vh;bottom:0;" + side + ":0;border-radius:0}",
        "#tuno-btn{bottom:16px;" + side + ":16px}",
      "}",
    ].join("");

    var el = document.createElement("style");
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ── SVG icons ────────────────────────────────────────────────────────────

  var ICON_CHAT  = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>';
  var ICON_CLOSE = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';

  // ── Build widget DOM ─────────────────────────────────────────────────────

  function _buildChatUrl() {
    // Pass visitor_id and saved phone in URL so the iframe can use them
    var params = new URLSearchParams({
      widget: "1",
      vid:    visitorId,
    });
    var phone = localStorage.getItem(PHONE_KEY);
    if (phone) params.set("phone", phone);
    return SERVER + "/?" + params.toString();
  }

  var _panelEl  = null;
  var _btnEl    = null;
  var _iframeEl = null;
  var _panelOpen = false;

  function _createWidget() {
    // Button
    _btnEl = document.createElement("button");
    _btnEl.id = "tuno-btn";
    _btnEl.setAttribute("aria-label", "Ouvrir le chat TuniOptique");
    _btnEl.innerHTML = ICON_CHAT + '<span id="tuno-badge"></span>';
    _btnEl.addEventListener("click", _togglePanel);

    // Panel + iframe
    _panelEl = document.createElement("div");
    _panelEl.id = "tuno-panel";

    _iframeEl = document.createElement("iframe");
    _iframeEl.title = "TuniOptique — Assistant";
    _iframeEl.setAttribute("allow", "microphone");
    // Iframe loads lazily — src is set when first opened
    _panelEl.appendChild(_iframeEl);

    document.body.appendChild(_panelEl);
    document.body.appendChild(_btnEl);

    // Restore open state across page navigations
    if (localStorage.getItem(OPEN_KEY) === "1") {
      _openPanel();
    }
  }

  // ── Panel open/close ─────────────────────────────────────────────────────

  function _openPanel() {
    if (!_iframeEl.src) {
      _iframeEl.src = _buildChatUrl();
    }
    _panelEl.classList.add("tuno-open");
    _btnEl.innerHTML = ICON_CLOSE;
    _panelOpen = true;
    localStorage.setItem(OPEN_KEY, "1");
  }

  function _closePanel() {
    _panelEl.classList.remove("tuno-open");
    setTimeout(function () {
      if (!_panelOpen) _panelEl.style.display = "none";
    }, 230);
    _btnEl.innerHTML = ICON_CHAT + '<span id="tuno-badge"></span>';
    _panelOpen = false;
    localStorage.setItem(OPEN_KEY, "0");
  }

  function _togglePanel() {
    if (_panelOpen) _closePanel(); else _openPanel();
  }

  // ── Cross-frame communication ────────────────────────────────────────────

  window.addEventListener("message", function (event) {
    // Only accept messages from our chat server
    try {
      var origin = new URL(SERVER).origin;
      if (event.origin !== origin && SERVER !== window.location.origin) return;
    } catch (_) {}

    var msg = event.data;
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "TUNO_IDENTIFIED" && msg.phone) {
      // Chat identified the visitor as a customer — persist in parent page
      localStorage.setItem(PHONE_KEY, msg.phone);
    }

    if (msg.type === "TUNO_CLOSE") {
      _closePanel();
    }

    if (msg.type === "TUNO_UNREAD" && msg.count > 0) {
      var badge = document.getElementById("tuno-badge");
      if (badge) {
        badge.textContent = msg.count;
        badge.style.display = "block";
      }
    }
  });

  // ── Public API ───────────────────────────────────────────────────────────

  window.TuniOptiqueWidget = {
    open:       _openPanel,
    close:      _closePanel,
    toggle:     _togglePanel,
    visitorId:  visitorId,
  };

  // ── Boot ─────────────────────────────────────────────────────────────────

  function _boot() {
    _registerVisitor();
    _injectStyles();
    _createWidget();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _boot);
  } else {
    _boot();
  }

})();
