# SPDX-License-Identifier: AGPL-3.0-only
"""RTSP newest-frame decoder; no browser RTSP dependency."""
import threading
import time
import cv2
from depthport.config import CFG

class CaptureWorker:
    """Decode continuously, retaining one newest frame. Timeout support is required."""
    def __init__(self, url: str):
        self._url = url
        self._quit = threading.Event()
        self._lock = threading.Lock()
        self._thread = threading.Thread(target=self._loop, name='rtsp-reader', daemon=True)
        self._seq = 0
        self._frame = None
        self._received_at = None
        self.connected = False
        self.error = None

    def start(self):
        self._thread.start()

    def stop(self):
        self._quit.set()
        if self._thread.is_alive():
            self._thread.join(timeout=1.5)
        # An in-progress read exits after its configured FFmpeg timeout. No unbounded join.

    def peek(self):
        with self._lock:
            return self._seq, (None if self._frame is None else self._frame.copy()), self._received_at

    def stats(self):
        with self._lock:
            return self.connected, self.error, self._seq

    def _disconnected(self, message: str | None):
        with self._lock:
            self.connected, self.error = False, message
            self._frame = None  # never publish stale data after a known disconnection

    def _loop(self):
        params = [cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, CFG.open_timeout_ms,
                  cv2.CAP_PROP_READ_TIMEOUT_MSEC, CFG.read_timeout_ms]
        while not self._quit.is_set():
            capture = None
            try:
                capture = cv2.VideoCapture(self._url, cv2.CAP_FFMPEG, params)
                if not capture.isOpened():
                    self._disconnected('Cannot open RTSP. Check IP, credentials, path, codec and FFmpeg support.')
                    self._quit.wait(2.)
                    continue
                with self._lock:
                    self.connected, self.error = True, None
                while not self._quit.is_set():
                    ok, frame = capture.read()
                    if not ok or frame is None:
                        self._disconnected('RTSP read failed or timed out; reconnecting.')
                        break
                    with self._lock:
                        self._frame, self._received_at = frame, time.time()
                        self._seq += 1
            except cv2.error:
                self._disconnected('OpenCV/FFmpeg capture error; verify the installed video backend and timeout support.')
            finally:
                if capture is not None:
                    capture.release()
            self._quit.wait(.8)
        self._disconnected(None)


