// Камераны басқару: қосу, өшіру, кадр алу
const Camera = (() => {
  let stream = null;
  const video = document.getElementById("video");
  const placeholder = document.getElementById("placeholder");

  async function start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Бұл браузер камераны қолдамайды");
    }
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    video.hidden = false;
    placeholder.hidden = true;
  }

  function stop() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
    video.hidden = true;
    placeholder.hidden = false;
  }

  function capture() {
    if (!stream || !video.videoWidth) return null;
    const canvas = document.createElement("canvas");
    const k = Math.min(1, 800 / video.videoWidth); // жылдам жүктелу үшін кішірейтеміз
    canvas.width = Math.round(video.videoWidth * k);
    canvas.height = Math.round(video.videoHeight * k);
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.9);
  }

  return { start, stop, capture };
})();
