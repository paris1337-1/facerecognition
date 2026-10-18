// Басты бет: камера, нақты уақыттағы рамка (браузерде), бетті сканерлеу
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const scanBtn = document.getElementById("scanBtn");
const startActions = document.getElementById("startActions");
const cameraActions = document.getElementById("cameraActions");
const resultBox = document.getElementById("result");
const faceBox = document.getElementById("faceBox");
const video = document.getElementById("video");

const MP_VERSION = "0.10.14";
const MP_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@" + MP_VERSION;
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

let detector = null;      // браузердегі бет детекторы
let detectorFailed = false;
let cameraOn = false;
let loopId = null;
let lastVideoTime = -1;
let lastSeen = 0;
let cur = null;           // рамканың ағымдағы орны (тегістелген)
let boxState = "live";    // live (көк) | ok (жасыл) | fail (қызыл)
let stateTimer = null;
let staticTimer = null;

function setBoxState(state) {
  boxState = state;
  faceBox.className = "face-box " + state;
}

// ---------- Детекторды жүктеу ----------
async function initDetector() {
  if (detector || detectorFailed) return;
  try {
    const vision = await import(MP_URL + "/vision_bundle.mjs");
    const fileset = await vision.FilesetResolver.forVisionTasks(MP_URL + "/wasm");
    const make = (delegate) => vision.FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: "VIDEO",
      minDetectionConfidence: 0.5,
    });
    try { detector = await make("GPU"); } catch (e) { detector = await make("CPU"); }
  } catch (e) {
    console.warn("Бет детекторы жүктелмеді:", e);
    detectorFailed = true;
  }
}

// ---------- Нақты уақыттағы рамка ----------
function trackLoop() {
  loopId = requestAnimationFrame(trackLoop);
  if (!detector || !cameraOn || video.readyState < 2 || video.paused) return;
  if (video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;

  const now = performance.now();
  const res = detector.detectForVideo(video, now);
  let best = null;
  for (const d of res.detections || []) {
    const b = d.boundingBox;
    if (b && (!best || b.width * b.height > best.width * best.height)) best = b;
  }

  if (best) {
    const vw = video.videoWidth, vh = video.videoHeight;
    const target = { x: best.originX / vw, y: best.originY / vh, w: best.width / vw, h: best.height / vh };
    if (!cur) cur = target;
    else for (const k of ["x", "y", "w", "h"]) cur[k] += (target[k] - cur[k]) * 0.55; // тегіс қозғалыс
    lastSeen = now;
    // бейне айна сияқты көрсетіледі, сондықтан x-ті айналдырамыз
    faceBox.style.left = (1 - (cur.x + cur.w)) * 100 + "%";
    faceBox.style.top = cur.y * 100 + "%";
    faceBox.style.width = cur.w * 100 + "%";
    faceBox.style.height = cur.h * 100 + "%";
    faceBox.hidden = false;
  } else if (now - lastSeen > 400) {
    faceBox.hidden = true;
    cur = null;
  }
}

function stopTracking() {
  cancelAnimationFrame(loopId);
  loopId = null;
  cur = null;
  lastVideoTime = -1;
  faceBox.hidden = true;
  clearTimeout(stateTimer);
  clearTimeout(staticTimer);
  setBoxState("live");
  Camera.unfreeze();
}

async function startTracking() {
  await initDetector();
  if (detector && cameraOn && loopId === null) {
    setBoxState("live");
    loopId = requestAnimationFrame(trackLoop);
  }
}

// Нәтиже шыққанда рамка түсі 4 секундқа өзгереді
function flashBox(ok) {
  setBoxState(ok ? "ok" : "fail");
  clearTimeout(stateTimer);
  stateTimer = setTimeout(() => setBoxState("live"), 4000);
}

// Детектор жоқ болса: серверден келген рамканы көрсетіп, кадрды тоқтатамыз
function staticBox(box, ok) {
  if (!box) return;
  const [x, y, w, h] = box;
  setBoxState(ok ? "ok" : "fail");
  faceBox.style.left = (1 - (x + w)) * 100 + "%";
  faceBox.style.top = y * 100 + "%";
  faceBox.style.width = w * 100 + "%";
  faceBox.style.height = h * 100 + "%";
  faceBox.hidden = false;
  Camera.freeze();
  clearTimeout(staticTimer);
  staticTimer = setTimeout(() => { faceBox.hidden = true; Camera.unfreeze(); }, 6000);
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

// ---------- Батырмалар ----------
startBtn.addEventListener("click", async () => {
  try {
    await Camera.start();
    cameraOn = true;
    startActions.hidden = true;
    cameraActions.hidden = false;
    resultBox.hidden = true;
    startTracking();
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
  cameraOn = false;
  stopTracking();
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
  const live = loopId !== null;
  try {
    const res = await fetch("/api/recognize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image }),
    });
    const data = await res.json();
    if (data.status === "recognized") {
      showResult("ok", "Сәтті танылды!", null, data.full_name);
      live ? flashBox(true) : staticBox(data.box, true);
    } else if (data.status === "no_face") {
      showResult("fail", data.message);
    } else if (data.status === "unknown") {
      showResult("fail", "Адам танылмады", "Деректер базасында сәйкес адам жоқ");
      live ? flashBox(false) : staticBox(data.box, false);
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
