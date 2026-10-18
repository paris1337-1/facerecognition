# -*- coding: utf-8 -*-
"""Бетті тану жүйесі — Flask + OpenCV (YuNet + SFace), SQLite/PostgreSQL."""
import base64
import hmac
import os
import threading
import time
from functools import wraps

import cv2
import numpy as np
from flask import Flask, Response, jsonify, redirect, render_template, request, session, url_for
from sqlalchemy import (Column, Integer, LargeBinary, MetaData, String, Table, create_engine,
                        delete, insert, select)

from download_models import MODELS, MODEL_DIR, ensure_models

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MATCH_THRESHOLD = 0.363  # SFace косинустық ұқсастық шегі
MAX_SIDE = 1280
THUMB_SIDE = 240

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
IS_LOCAL = os.environ.get("FLASK_ENV") == "development" or not os.environ.get("PORT")

app = Flask(__name__)
app.config.update(
    SECRET_KEY=os.environ.get("SECRET_KEY") or "local-dev-secret-change-me",
    MAX_CONTENT_LENGTH=10 * 1024 * 1024,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=not IS_LOCAL,
)

# ---------- Деректер базасы ----------
db_url = os.environ.get("DATABASE_URL") or "sqlite:///" + os.path.join(BASE_DIR, "database", "faces.db")
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+psycopg2://", 1)
if db_url.startswith("sqlite"):
    os.makedirs(os.path.join(BASE_DIR, "database"), exist_ok=True)

engine = create_engine(db_url, pool_pre_ping=True)
metadata = MetaData()
persons = Table(
    "persons", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("first_name", String(60), nullable=False),
    Column("middle_name", String(60), nullable=False),
    Column("last_name", String(60), nullable=False),
    Column("photo", LargeBinary, nullable=False),      # кішірейтілген JPEG
    Column("embedding", LargeBinary, nullable=False),  # 128 float32 вектор
)
metadata.create_all(engine)

# ---------- Модельдер ----------
_lock = threading.Lock()
_models = {}


def load_models():
    with _lock:
        if _models:
            return _models
        ensure_models()
        _models["detector"] = cv2.FaceDetectorYN.create(
            os.path.join(MODEL_DIR, MODELS["detector"][0]), "", (320, 320), 0.8, 0.3, 5000)
        _models["recognizer"] = cv2.FaceRecognizerSF.create(
            os.path.join(MODEL_DIR, MODELS["recognizer"][0]), "")
        return _models


def get_embedding(img):
    """Ең үлкен беттің векторын қайтарады; бет жоқ болса None."""
    m = load_models()
    h, w = img.shape[:2]
    scale = MAX_SIDE / max(h, w)
    if scale < 1:
        img = cv2.resize(img, (int(w * scale), int(h * scale)))
        h, w = img.shape[:2]
    with _lock:
        m["detector"].setInputSize((w, h))
        _, faces = m["detector"].detect(img)
        if faces is None or len(faces) == 0:
            return None
        best = faces[int(np.argmax(faces[:, 2] * faces[:, 3]))]
        feat = m["recognizer"].feature(m["recognizer"].alignCrop(img, best))
    return feat.flatten().astype(np.float32)


def decode_image(data):
    return cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)


def make_thumbnail(img):
    h, w = img.shape[:2]
    scale = THUMB_SIDE / max(h, w)
    if scale < 1:
        img = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    return cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])[1].tobytes()


def cosine(a, b):
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))


def error(message, code=400):
    return jsonify({"status": "error", "message": message}), code


def admin_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get("admin"):
            if request.path.startswith("/api/"):
                return error("Алдымен әкімші ретінде кіріңіз", 401)
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return wrapper


# ---------- Беттер ----------
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/register")
@admin_required
def register_page():
    return render_template("register.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    err = None
    if request.method == "POST":
        pwd = request.form.get("password", "")
        if not ADMIN_PASSWORD:
            err = "Әкімші құпия сөзі серверде орнатылмаған"
        elif hmac.compare_digest(pwd.encode(), ADMIN_PASSWORD.encode()):
            session["admin"] = True
            return redirect(url_for("register_page"))
        else:
            time.sleep(1)  # құпия сөзді тез іздеуден қорғайды
            err = "Құпия сөз қате"
    return render_template("login.html", error=err)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))


@app.route("/healthz")
def healthz():
    return "ok"


# ---------- API ----------
@app.route("/api/recognize", methods=["POST"])
def recognize():
    image = (request.get_json(silent=True) or {}).get("image", "")
    if "," not in image:
        return error("Кадр алынбады. Камераны қайта қосыңыз")
    try:
        img = decode_image(base64.b64decode(image.split(",", 1)[1]))
        if img is None:
            return error("Кадрды оқу мүмкін болмады")
        emb = get_embedding(img)
    except Exception as exc:
        app.logger.error("Тану қатесі: %s", exc)
        return error("Қате пайда болды. Кейінірек қайталаңыз", 500)

    if emb is None:
        return jsonify({"status": "no_face", "message": "Бет анықталмады. Камераға тура қараңыз"})

    best_row, best_score = None, -1.0
    with engine.connect() as conn:
        rows = conn.execute(select(persons.c.first_name, persons.c.middle_name,
                                   persons.c.last_name, persons.c.embedding)).fetchall()
    for row in rows:
        score = cosine(emb, np.frombuffer(bytes(row.embedding), dtype=np.float32))
        if score > best_score:
            best_row, best_score = row, score

    if best_row is not None and best_score >= MATCH_THRESHOLD:
        name = f"{best_row.first_name} {best_row.middle_name} {best_row.last_name}"
        return jsonify({"status": "recognized", "full_name": name})
    return jsonify({"status": "unknown",
                    "message": "Адам танылмады. Деректер базасында сәйкес адам жоқ"})


@app.route("/api/persons", methods=["GET"])
@admin_required
def list_persons():
    with engine.connect() as conn:
        rows = conn.execute(select(persons.c.id, persons.c.first_name, persons.c.middle_name,
                                   persons.c.last_name).order_by(persons.c.id.desc())).fetchall()
    return jsonify([{"id": r.id,
                     "full_name": f"{r.first_name} {r.middle_name} {r.last_name}",
                     "photo": f"/api/persons/{r.id}/photo"} for r in rows])


@app.route("/api/persons/<int:pid>/photo")
@admin_required
def person_photo(pid):
    with engine.connect() as conn:
        row = conn.execute(select(persons.c.photo).where(persons.c.id == pid)).fetchone()
    if row is None:
        return error("Жазба табылмады", 404)
    return Response(bytes(row.photo), mimetype="image/jpeg",
                    headers={"Cache-Control": "private, max-age=3600"})


@app.route("/api/persons", methods=["POST"])
@admin_required
def add_person():
    first = request.form.get("first_name", "").strip()[:60]
    middle = request.form.get("middle_name", "").strip()[:60]
    last = request.form.get("last_name", "").strip()[:60]
    file = request.files.get("photo")
    if not (first and middle and last):
        return error("Аты, әкесінің аты және тегін толтырыңыз")
    if file is None or file.filename == "":
        return error("Фотосуретті таңдаңыз")
    img = decode_image(file.read())
    if img is None:
        return error("Файл сурет емес. JPG немесе PNG таңдаңыз")
    try:
        emb = get_embedding(img)
    except Exception as exc:
        app.logger.error("Тіркеу қатесі: %s", exc)
        return error("Қате пайда болды. Кейінірек қайталаңыз", 500)
    if emb is None:
        return error("Фотосуретте бет анықталмады. Басқа сурет таңдаңыз")

    with engine.begin() as conn:
        conn.execute(insert(persons).values(first_name=first, middle_name=middle, last_name=last,
                                            photo=make_thumbnail(img), embedding=emb.tobytes()))
    return jsonify({"status": "ok", "message": "Адам сәтті тіркелді"})


@app.route("/api/persons/<int:pid>", methods=["DELETE"])
@admin_required
def delete_person(pid):
    with engine.begin() as conn:
        res = conn.execute(delete(persons).where(persons.c.id == pid))
    if res.rowcount == 0:
        return error("Жазба табылмады", 404)
    return jsonify({"status": "ok", "message": "Жазба жойылды"})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
