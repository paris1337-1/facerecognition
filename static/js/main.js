// Басты бет: камераны қосу және бетті сканерлеу
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const scanBtn = document.getElementById("scanBtn");
const startActions = document.getElementById("startActions");
const cameraActions = document.getElementById("cameraActions");
const resultBox = document.getElementById("result");

function showResult(kind, title, detail, name) {
  resultBox.className = "card " + kind;
  resultBox.replaceChildren();
  const s = document.createElement("p");
  s.className = "status";
  s.textContent = title;
  resultBox.appendChild(s);
  if (name) {
    const n = document.createElement("p");
    n.className = "name";
    n.textContent = name;
    resultBox.appendChild(n);
  }
  if (detail) {
    const d = document.createElement("p");
    d.className = "detail";
    d.textContent = detail;
    resultBox.appendChild(d);
  }
  resultBox.hidden = false;
}

startBtn.addEventListener("click", async () => {
  try {
    await Camera.start();
    startActions.hidden = true;
    cameraActions.hidden = false;
    resultBox.hidden = true;
  } catch (err) {
    const denied = err && (err.name === "NotAllowedError" || err.name === "SecurityError");
    const missing = err && err.name === "NotFoundError";
    showResult("fail", "Қате пайда болды",
      denied ? "Камераға қол жеткізуге рұқсат беріңіз"
      : missing ? "Камера табылмады. Құрылғыны тексеріңіз"
      : "Камераны қосу мүмкін болмады");
  }
});

stopBtn.addEventListener("click", () => {
  Camera.stop();
  cameraActions.hidden = true;
  startActions.hidden = false;
  resultBox.hidden = true;
});

scanBtn.addEventListener("click", async () => {
  const image = Camera.capture();
  if (!image) {
    showResult("fail", "Қате пайда болды", "Кадр алынбады. Біраз күтіп, қайталаңыз");
    return;
  }
  scanBtn.disabled = true;
  scanBtn.textContent = "Сканерленуде...";
  try {
    const res = await fetch("/api/recognize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image }),
    });
    const data = await res.json();
    if (data.status === "recognized") {
      showResult("ok", "Сәтті танылды!", null, data.full_name);
    } else if (data.status === "no_face") {
      showResult("fail", data.message);
    } else if (data.status === "unknown") {
      showResult("fail", "Адам танылмады", "Деректер базасында сәйкес адам жоқ");
    } else {
      showResult("fail", "Қате пайда болды", data.message);
    }
  } catch (e) {
    showResult("fail", "Қате пайда болды", "Серверге қосылу мүмкін болмады");
  } finally {
    scanBtn.disabled = false;
    scanBtn.textContent = "Бетті сканерлеу";
  }
});
