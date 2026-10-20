// Тіркеу беті: форма жіберу, тізімді көрсету, жазбаны жою
const form = document.getElementById("regForm");
const msg = document.getElementById("formMsg");
const list = document.getElementById("list");
const preview = document.getElementById("preview");

function setMsg(kind, text) {
  msg.className = "msg " + kind;
  msg.textContent = text;
  msg.hidden = false;
}

form.elements.photo.addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (f) { preview.src = URL.createObjectURL(f); preview.hidden = false; }
  else preview.hidden = true;
});

async function loadList() {
  try {
    const res = await fetch("/api/persons");
    if (res.status === 401) { location.href = "/login"; return; }
    const persons = await res.json();
    list.replaceChildren();
    if (!persons.length) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = "Әлі ешкім тіркелмеген";
      list.appendChild(p);
      return;
    }
    persons.forEach((p) => {
      const item = document.createElement("div");
      item.className = "item";
      const img = document.createElement("img");
      img.src = p.photo; img.alt = "";
      const name = document.createElement("span");
      name.className = "n"; name.textContent = p.full_name;
      const del = document.createElement("button");
      del.className = "btn danger"; del.type = "button"; del.textContent = "Жою";
      del.addEventListener("click", async () => {
        if (!confirm("Бұл жазбаны жойғыңыз келе ме?")) return;
        const r = await fetch("/api/persons/" + p.id, { method: "DELETE" });
        if (!r.ok) setMsg("fail", "Қате пайда болды");
        loadList();
      });
      item.append(img, name, del);
      list.appendChild(item);
    });
  } catch (e) {
    list.textContent = "Қате пайда болды";
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = form.querySelector("button[type=submit]");
  btn.disabled = true;
  setMsg("", "Тексерілуде...");
  try {
    const res = await fetch("/api/persons", { method: "POST", body: new FormData(form) });
    if (res.status === 401) { location.href = "/login"; return; }
    const data = await res.json();
    if (res.ok) {
      setMsg("ok", data.message);
      form.reset();
      preview.hidden = true;
      loadList();
    } else {
      setMsg("fail", data.message || "Қате пайда болды");
    }
  } catch (err) {
    setMsg("fail", "Қате пайда болды");
  } finally {
    btn.disabled = false;
  }
});

loadList();
