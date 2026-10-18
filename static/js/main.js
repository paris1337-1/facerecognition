// Басты бет: камераны қосу, бетті сканерлеу, бетке рамка салу
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const scanBtn = document.getElementById("scanBtn");
const startActions = document.getElementById("startActions");
const cameraActions = document.getElementById("cameraActions");
const resultBox = document.getElementById("result");
const faceBox = document.getElementById("faceBox");
let boxTimer = null;

function hideBox() {
  clearTimeout(boxTimer);
  faceBox.hidden = true;
  Camera.unfreeze();
}

function showBox(box, ok) {
  hideBox();
  if (!box) return;
  const [x, y, w, h] = box;
  faceBox.className = "face-box" + (ok ? "" : " fail");
  // бейне айна сияқты көрсетіледі, сондықтан x координатасын айналдырамыз
  faceBox.style.left = (1 - (x + w)) * 100 + "%";
  faceBox.style.top = y * 100 + "%";
  faceBox.style.width = w * 100 + "%";
  faceBox.style.height = h * 100 + "%";
  faceBox.hidden = false;
  Camera.freeze();
  boxTimer = setTimeout(hideBox, 6000);
}

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
  hideBox();
  Camera.stop();
  cameraActions.hidden = true;
  startActions.hidden = false;
  resultBox.hidden = true;
});

scanBtn.addEventListener("click", async () => {
  hideBox();
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
      showBox(data.box, true);
    } else if (data.status === "no_face") {
      showResult("fail", data.message);
    } else if (data.status === "unknown") {
      showResult("fail", "Адам танылмады", "Деректер базасында сәйкес адам жоқ");
      showBox(data.box, false);
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
