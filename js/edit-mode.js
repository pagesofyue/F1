/* Edit mode: type the admin password once on any page and edit in place
   (results, notes). Shares the sign-in with admin.html (same sessionStorage key). */
const EditMode = (function () {
  const KEY = "f1site:admin:password";
  const listeners = [];
  let on = !!sessionStorage.getItem(KEY);
  let btn = null;

  const url = () => CONFIG.ADMIN && CONFIG.ADMIN.APPS_SCRIPT_URL;
  const password = () => sessionStorage.getItem(KEY) || "";
  const isOn = () => on && !!password();
  const emit = () => listeners.forEach(fn => fn(isOn()));

  async function post(payload) {
    const res = await fetch(url(), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoids a CORS preflight
      body: JSON.stringify({ ...payload, password: password() }),
    });
    const json = await res.json();
    if (!json.ok && /password/i.test(json.error || "")) lock(); // wrong/expired password -> relock
    return json;
  }

  function lock() {
    sessionStorage.removeItem(KEY);
    on = false; paintButton(); emit();
  }

  function askPassword() {
    return new Promise(resolve => {
      const wrap = document.createElement("div");
      wrap.className = "em-modal";
      wrap.innerHTML = `<form class="em-modal__box">
        <h3>Enter admin password</h3>
        <input type="password" class="admin-input" autocomplete="current-password" required />
        <p class="admin-error" style="display:none"></p>
        <div style="display:flex;gap:10px;margin-top:12px">
          <button type="submit" class="btn btn--primary">Unlock editing</button>
          <button type="button" class="btn btn--ghost" data-cancel>Cancel</button>
        </div></form>`;
      document.body.appendChild(wrap);
      const input = wrap.querySelector("input"), err = wrap.querySelector(".admin-error");
      input.focus();
      const done = (v) => { wrap.remove(); resolve(v); };
      wrap.querySelector("[data-cancel]").addEventListener("click", () => done(false));
      wrap.querySelector("form").addEventListener("submit", async (e) => {
        e.preventDefault();
        sessionStorage.setItem(KEY, input.value);
        err.style.display = "none";
        try {
          const json = await post({ action: "verify" });
          if (json.ok) { on = true; return done(true); }
          err.textContent = json.error || "Incorrect password."; err.style.display = "block";
        } catch (e2) {
          sessionStorage.removeItem(KEY);
          err.textContent = "Couldn't reach the Apps Script — is it deployed?"; err.style.display = "block";
        }
      });
    });
  }

  async function toggle() {
    if (isOn()) return lock();
    if (await askPassword()) { paintButton(); emit(); }
  }

  function paintButton() {
    if (!btn) return;
    btn.textContent = isOn() ? "✎ Editing — lock" : "🔒 Edit";
    btn.classList.toggle("is-on", isOn());
  }

  function init() {
    if (!url()) return; // Apps Script not connected: no edit mode at all
    const nav = document.querySelector(".topbar__nav");
    if (!nav) return;
    btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn--ghost btn--small em-toggle";
    btn.addEventListener("click", toggle);
    nav.appendChild(btn);
    paintButton();
  }

  document.addEventListener("DOMContentLoaded", init);
  return { isOn, password, post, lock, onChange: (fn) => listeners.push(fn) };
})();
