/**
 * app.js
 * Main application — MediaPipe Pose pipeline, rendering, HUD, voice coaching.
 *
 * Pipeline:
 *   Camera → MediaPipe Pose → 30 Landmarks → Confidence Gate →
 *   Normalize → Joint Angles → EMA Smooth → Pose Evaluate →
 *   Debounce → HUD Update → Skeleton Render → Voice Cue
 */

"use strict";

import {
  LANDMARK_MAP,
  SKELETON_CONNECTIONS,
  getLandmark,
  normalizeLandmarks,
  computeJointAngles,
  smoothAngle,
  resetEMA,
  evaluatePose,
  detectPose,
  debounceJoint,
  resetDebounce,
} from "./geometry.js";

import {
  POSE_DEFINITIONS,
  POSE_LIST,
} from "./pose_definitions.js";

// ═══════════════════════════════════════════════════════════════════════════
// DOM ELEMENTS
// ═══════════════════════════════════════════════════════════════════════════
const videoEl       = document.getElementById("webcam");
const canvasEl      = document.getElementById("skeleton-canvas");
const ctx           = canvasEl.getContext("2d");
const fpsEl         = document.getElementById("fps-counter");
const scoreEl       = document.getElementById("score-value");
const scoreFillEl   = document.getElementById("score-fill");
const poseNameEl    = document.getElementById("current-pose-name");
const feedbackListEl= document.getElementById("feedback-list");
const jointTableEl  = document.getElementById("joint-table-body");
const statusBadgeEl = document.getElementById("status-badge");
const holdBarEl     = document.getElementById("hold-bar-fill");
const holdTimerEl   = document.getElementById("hold-timer");
const devPanelEl    = document.getElementById("dev-panel-body");
const cueTextEl     = document.getElementById("cue-text");
const autoDetectBtn = document.getElementById("btn-auto-detect");
const resetBtn      = document.getElementById("btn-reset");
const voiceToggleEl = document.getElementById("voice-toggle");
const loadingEl     = document.getElementById("loading-overlay");

// Pose selector buttons
const poseBtns = document.querySelectorAll(".pose-btn");

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════
let currentPoseKey  = "warrior_2";
let autoDetectMode  = false;
let voiceEnabled    = false;
let lastFrameTime   = performance.now();
let frameTimes      = [];
let holdStartTime   = null;
let holdSeconds     = 0;
let lastVoiceCue    = "";
let voiceCueTimeout = null;
let poseLoaded      = false;

const HOLD_TARGET    = () => POSE_DEFINITIONS[currentPoseKey]?.holdTarget ?? 30;
const DEV_MODE       = window.location.search.includes("dev=1");

// ═══════════════════════════════════════════════════════════════════════════
// FPS TRACKER
// ═══════════════════════════════════════════════════════════════════════════
function trackFPS() {
  const now = performance.now();
  const delta = now - lastFrameTime;
  lastFrameTime = now;
  frameTimes.push(delta);
  if (frameTimes.length > 30) frameTimes.shift();
  const avgMs = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
  fpsEl.textContent = `${Math.round(1000 / avgMs)} FPS`;
}

// ═══════════════════════════════════════════════════════════════════════════
// SKELETON RENDERER
// ═══════════════════════════════════════════════════════════════════════════
const COLORS = {
  correct:     "#00e5a0",   // emerald
  incorrect:   "#ff4d6d",   // rose-red
  not_visible: "#888",      // grey
  bone:        "rgba(255,255,255,0.30)",
  boneBad:     "rgba(255,77,109,0.50)",
};

function drawSkeleton(rawLandmarks, jointResults) {
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

  const W = canvasEl.width;
  const H = canvasEl.height;

  // Helper: pixel position from normalized [0-1] coordinates
  const px = (lm) => ({ x: lm.x * W, y: lm.y * H });

  // ── Bones ────────────────────────────────────────────────────────────────
  ctx.lineWidth = 3;
  for (const [nameA, nameB] of SKELETON_CONNECTIONS) {
    const idxA = LANDMARK_MAP[nameA];
    const idxB = LANDMARK_MAP[nameB];
    if (idxA === undefined || idxB === undefined) continue;
    const lmA = rawLandmarks[idxA];
    const lmB = rawLandmarks[idxB];
    if (!lmA || !lmB) continue;
    if ((lmA.visibility ?? 0) < 0.4 || (lmB.visibility ?? 0) < 0.4) continue;

    const pA = px(lmA);
    const pB = px(lmB);

    // Color bone by worst connected joint
    ctx.strokeStyle = COLORS.bone;
    ctx.beginPath();
    ctx.moveTo(pA.x, pA.y);
    ctx.lineTo(pB.x, pB.y);
    ctx.stroke();
  }

  // ── Joints ───────────────────────────────────────────────────────────────
  const JOINT_NAMES_TO_DRAW = new Set([
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist",    "right_wrist",    "left_hip",   "right_hip",
    "left_knee",     "right_knee",     "left_ankle", "right_ankle",
    "nose",
  ]);

  for (const name of JOINT_NAMES_TO_DRAW) {
    const idx = LANDMARK_MAP[name];
    if (idx === undefined) continue;
    const lm = rawLandmarks[idx];
    if (!lm || (lm.visibility ?? 0) < 0.4) continue;

    const p = px(lm);
    const jResult = jointResults?.[name];
    let color = "#ffffff";
    let radius = 6;

    if (jResult) {
      if (jResult.status === "correct")     { color = COLORS.correct;   radius = 8; }
      else if (jResult.status === "incorrect") { color = COLORS.incorrect; radius = 8; }
      else if (jResult.status === "not_visible") { color = COLORS.not_visible; }
    }

    // Outer glow
    ctx.shadowColor = color;
    ctx.shadowBlur  = 12;
    ctx.fillStyle   = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Angle label (dev mode or key joints)
    if (jResult?.angle !== null && jResult?.angle !== undefined) {
      ctx.fillStyle   = "rgba(255,255,255,0.85)";
      ctx.font        = "bold 11px 'Inter', sans-serif";
      ctx.fillText(`${Math.round(jResult.angle)}°`, p.x + 10, p.y - 6);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HUD UPDATER
// ═══════════════════════════════════════════════════════════════════════════
function updateHUD(evalResult) {
  if (!evalResult) return;

  // Score ring
  const score = evalResult.score ?? 0;
  scoreEl.textContent = `${score}%`;
  scoreFillEl.style.strokeDashoffset = 283 - (283 * score / 100);
  scoreFillEl.style.stroke = score >= 70 ? COLORS.correct
                           : score >= 45 ? "#f7c900"
                           : COLORS.incorrect;

  // Status badge
  const correct = evalResult.correct;
  statusBadgeEl.textContent = correct ? "✓ CORRECT" : "✗ ADJUST";
  statusBadgeEl.className   = "status-badge " + (correct ? "badge-correct" : "badge-incorrect");

  // Hold timer
  if (correct) {
    if (!holdStartTime) holdStartTime = Date.now();
    holdSeconds = (Date.now() - holdStartTime) / 1000;
    const pct = Math.min(holdSeconds / HOLD_TARGET() * 100, 100);
    holdBarEl.style.width = `${pct}%`;
    holdTimerEl.textContent = `${Math.floor(holdSeconds)}s / ${HOLD_TARGET()}s`;
  } else {
    holdStartTime = null;
    holdBarEl.style.width = "0%";
    holdTimerEl.textContent = `0s / ${HOLD_TARGET()}s`;
  }

  // Feedback cues list
  feedbackListEl.innerHTML = "";
  if (evalResult.feedback && evalResult.feedback.length > 0) {
    const topCues = evalResult.feedback.slice(0, 4);
    for (const item of topCues) {
      const li = document.createElement("li");
      li.className = "feedback-item";
      li.innerHTML = `<span class="joint-tag">${item.joint.replace(/_/g," ")}</span> ${item.cue}`;
      feedbackListEl.appendChild(li);
    }
    // Voice coaching
    const topCue = topCues[0]?.cue;
    if (voiceEnabled && topCue && topCue !== lastVoiceCue) {
      speakCue(topCue);
      lastVoiceCue = topCue;
    }
    cueTextEl.textContent = topCues[0]?.cue ?? "";
  } else {
    cueTextEl.textContent = correct ? "Perfect form! Keep holding." : "";
    if (voiceEnabled && correct && lastVoiceCue !== "perfect") {
      speakCue("Great job! Hold the pose.");
      lastVoiceCue = "perfect";
    }
  }

  // Joint detail table
  jointTableEl.innerHTML = "";
  for (const [joint, jData] of Object.entries(evalResult.joints)) {
    const tr  = document.createElement("tr");
    const angleStr = jData.angle !== null ? `${jData.angle}°` : "—";
    const targetStr = `${jData.target[0]}°–${jData.target[1]}°`;
    const cls = jData.status === "correct"   ? "row-correct"
              : jData.status === "incorrect" ? "row-incorrect"
              : "row-invisible";
    tr.className = cls;
    tr.innerHTML = `
      <td>${joint.replace(/_/g, " ")}</td>
      <td>${angleStr}</td>
      <td>${targetStr}</td>
      <td><span class="dot dot-${jData.status}"></span></td>`;
    jointTableEl.appendChild(tr);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DEV PANEL
// ═══════════════════════════════════════════════════════════════════════════
function updateDevPanel(rawLandmarks) {
  if (!DEV_MODE || !devPanelEl) return;
  const KEY_LANDMARKS = ["left_shoulder","right_shoulder","left_hip","right_hip",
                          "left_knee","right_knee","left_elbow","right_elbow",
                          "left_wrist","right_wrist","nose"];
  let html = "<table><tr><th>Landmark</th><th>x</th><th>y</th><th>z</th><th>vis</th></tr>";
  for (const name of KEY_LANDMARKS) {
    const idx = LANDMARK_MAP[name];
    const lm  = rawLandmarks[idx];
    if (!lm) continue;
    const vis = (lm.visibility ?? 0).toFixed(2);
    const visCls = lm.visibility >= 0.7 ? "dev-ok" : lm.visibility >= 0.5 ? "dev-warn" : "dev-bad";
    html += `<tr>
      <td>${name}</td>
      <td>${lm.x.toFixed(3)}</td>
      <td>${lm.y.toFixed(3)}</td>
      <td>${(lm.z ?? 0).toFixed(3)}</td>
      <td class="${visCls}">${vis}</td>
    </tr>`;
  }
  html += "</table>";
  devPanelEl.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════════════
// VOICE COACHING
// ═══════════════════════════════════════════════════════════════════════════
function speakCue(text) {
  if (!("speechSynthesis" in window)) return;
  clearTimeout(voiceCueTimeout);
  voiceCueTimeout = setTimeout(() => {
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate   = 0.95;
    utt.pitch  = 1.05;
    utt.volume = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utt);
  }, 300);
}

// ═══════════════════════════════════════════════════════════════════════════
// MEDIAPIPE RESULTS HANDLER
// ═══════════════════════════════════════════════════════════════════════════
function onResults(results) {
  if (!poseLoaded) {
    poseLoaded = true;
    loadingEl.classList.add("hidden");
  }

  trackFPS();

  // Sync canvas size to video
  canvasEl.width  = videoEl.videoWidth  || 640;
  canvasEl.height = videoEl.videoHeight || 480;

  const rawLandmarks = results.poseLandmarks;
  if (!rawLandmarks) {
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    statusBadgeEl.textContent = "No person detected";
    statusBadgeEl.className   = "status-badge badge-unknown";
    return;
  }

  // Normalize
  const norm = normalizeLandmarks(rawLandmarks);
  if (!norm) return;

  // Compute raw angles
  const rawAngles = computeJointAngles(norm);

  // Apply EMA smoothing
  const smoothedAngles = {};
  for (const [joint, data] of Object.entries(rawAngles)) {
    if (data.visible && data.angle !== null) {
      smoothedAngles[joint] = { angle: smoothAngle(joint, data.angle), visible: true };
    } else {
      smoothedAngles[joint] = data;
    }
  }

  // Auto-detect or use selected pose
  let activePoseKey = currentPoseKey;
  if (autoDetectMode) {
    const detection = detectPose(smoothedAngles);
    if (detection.bestPose !== "unknown") {
      activePoseKey = detection.bestPose;
      poseNameEl.textContent = POSE_DEFINITIONS[activePoseKey].description +
        ` (auto ${detection.confidence}%)`;
    } else {
      poseNameEl.textContent = "Looking for pose…";
    }
  }

  // Evaluate pose
  const poseDef    = POSE_DEFINITIONS[activePoseKey];
  const evalResult = evaluatePose(poseDef, smoothedAngles);

  // Build joint results with debouncing
  const debouncedJoints = {};
  for (const [joint, jData] of Object.entries(evalResult.joints)) {
    const surfaceIncorrect = !debounceJoint(joint, jData.correct);
    debouncedJoints[joint] = {
      ...jData,
      status: jData.status === "incorrect" && !surfaceIncorrect ? "correct" : jData.status,
      correct: jData.correct || (jData.status === "incorrect" && !surfaceIncorrect),
    };
  }
  evalResult.joints = debouncedJoints;

  // Render
  drawSkeleton(rawLandmarks, evalResult.joints);
  updateHUD(evalResult);
  updateDevPanel(rawLandmarks);
}

// ═══════════════════════════════════════════════════════════════════════════
// MEDIAPIPE POSE SETUP
// ═══════════════════════════════════════════════════════════════════════════
async function initMediaPipe() {
  const pose = new window.Pose({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/${file}`,
  });

  pose.setOptions({
    modelComplexity:      1,
    smoothLandmarks:      true,
    enableSegmentation:   false,
    smoothSegmentation:   false,
    minDetectionConfidence: 0.55,
    minTrackingConfidence:  0.55,
  });

  pose.onResults(onResults);

  const camera = new window.Camera(videoEl, {
    onFrame: async () => {
      await pose.send({ image: videoEl });
    },
    width:  640,
    height: 480,
    facingMode: "user",
  });

  await camera.start();
}

// ═══════════════════════════════════════════════════════════════════════════
// POSE SELECTOR
// ═══════════════════════════════════════════════════════════════════════════
function selectPose(key) {
  currentPoseKey      = key;
  autoDetectMode      = false;
  autoDetectBtn.classList.remove("active");
  resetEMA();
  resetDebounce();
  holdStartTime       = null;
  lastVoiceCue        = "";

  poseBtns.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.pose === key);
  });

  const pose = POSE_DEFINITIONS[key];
  poseNameEl.textContent = pose.description;
  cueTextEl.textContent  = "";
  feedbackListEl.innerHTML = "";
  holdTimerEl.textContent  = `0s / ${pose.holdTarget}s`;
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════════════════
poseBtns.forEach(btn => {
  btn.addEventListener("click", () => selectPose(btn.dataset.pose));
});

autoDetectBtn.addEventListener("click", () => {
  autoDetectMode = !autoDetectMode;
  autoDetectBtn.classList.toggle("active", autoDetectMode);
  if (autoDetectMode) poseNameEl.textContent = "Auto-detecting…";
  resetEMA();
  resetDebounce();
});

resetBtn.addEventListener("click", () => {
  selectPose(currentPoseKey);
  scoreEl.textContent    = "0%";
  scoreFillEl.style.strokeDashoffset = 283;
  holdBarEl.style.width  = "0%";
  holdStartTime          = null;
});

voiceToggleEl.addEventListener("change", () => {
  voiceEnabled = voiceToggleEl.checked;
  if (voiceEnabled) speakCue("Voice coaching enabled");
});

// Dev panel toggle
const devToggleBtn = document.getElementById("btn-dev-panel");
if (devToggleBtn) {
  devToggleBtn.addEventListener("click", () => {
    const panel = document.getElementById("dev-panel");
    panel.classList.toggle("hidden");
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════════════════
selectPose("warrior_2");
initMediaPipe().catch(err => {
  loadingEl.innerHTML = `
    <div class="loading-inner">
      <p class="error-msg">⚠️ Camera Error: ${err.message}</p>
      <p>Please allow camera access and reload.</p>
    </div>`;
});
