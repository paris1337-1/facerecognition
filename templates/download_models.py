# -*- coding: utf-8 -*-
"""OpenCV модельдерін жүктейді. Деплой кезінде build қадамында орындалады."""
import os
import urllib.request

BASE_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/"
MODELS = {
    "detector": ("face_detection_yunet_2023mar.onnx",
                 BASE_URL + "face_detection_yunet/face_detection_yunet_2023mar.onnx"),
    "recognizer": ("face_recognition_sface_2021dec.onnx",
                   BASE_URL + "face_recognition_sface/face_recognition_sface_2021dec.onnx"),
}
MODEL_DIR = os.environ.get("MODEL_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "models"))


def ensure_models():
    os.makedirs(MODEL_DIR, exist_ok=True)
    for fname, url in MODELS.values():
        path = os.path.join(MODEL_DIR, fname)
        if not os.path.exists(path) or os.path.getsize(path) < 10000:
            print(f"Модель жүктелуде: {fname}")
            urllib.request.urlretrieve(url, path)
    return MODEL_DIR


if __name__ == "__main__":
    ensure_models()
    print("Модельдер дайын")
