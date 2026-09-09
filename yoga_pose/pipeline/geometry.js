/**
 * geometry.js
 * Core mathematical engine for yoga pose analysis.
 *
 * Responsibilities:
 *  - 30-landmark → MediaPipe index mapping
 *  - Coordinate normalization (body-relative, scale-invariant)
 *  - 3D / 2D joint angle calculation
 *  - Landmark visibility / confidence gating
 *  - Exponential Moving Average temporal smoother
 *  - Per-joint pose scoring
 */

"use strict";

// ---------------------------------------------------------------------------
// 1. 30-POINT LANDMARK MAP
//    Keys: semantic body-part names used throughout the system.
//    Values: MediaPipe Pose landmark indices (0-32).
// ---------------------------------------------------------------------------
export const LANDMARK_MAP = {
  nose:              0,
  left_eye_inner:    1,
  left_eye:          2,
  left_eye_outer:    3,
  right_eye_inner:   4,
  right_eye:         5,
  right_eye_outer:   6,
  left_ear:          7,
  right_ear:         8,
  mouth_left:        9,
  mouth_right:       10,
  left_shoulder:     11,
  right_shoulder:    12,
  left_elbow:        13,
  right_elbow:       14,
  left_wrist:        15,
  right_wrist:       16,
  left_pinky:        17,
  right_pinky:       18,
  left_index:        19,
  right_index:       20,
  left_thumb:        21,
  right_thumb:       22,
  left_hip:          23,
  right_hip:         24,
  left_knee:         25,
  right_knee:        26,
  left_ankle:        27,
  right_ankle:       28,
  left_foot_index:   31,
  right_foot_index:  32,
};

// Human-readable display labels
export const LANDMARK_LABELS = {
  left_shoulder: "L Shoulder", right_shoulder: "R Shoulder",
  left_elbow:    "L Elbow",    right_elbow:    "R Elbow",
  left_wrist:    "L Wrist",    right_wrist:    "R Wrist",
  left_hip:      "L Hip",      right_hip:      "R Hip",
  left_knee:     "L Knee",     right_knee:     "R Knee",
  left_ankle:    "L Ankle",    right_ankle:    "R Ankle",
  left_foot_index:"L Foot",   right_foot_index:"R Foot",
  nose:          "Nose",
};

// Skeleton connections for overlay drawing [nameA, nameB]
export const SKELETON_CONNECTIONS = [
  // Spine / core
  ["left_shoulder",  "right_shoulder"],
  ["left_shoulder",  "left_hip"],
  ["right_shoulder", "right_hip"],
  ["left_hip",       "right_hip"],
  // Left arm
  ["left_shoulder",  "left_elbow"],
  ["left_elbow",     "left_wrist"],
  // Right arm
  ["right_shoulder", "right_elbow"],
  ["right_elbow",    "right_wrist"],
  // Left leg
  ["left_hip",       "left_knee"],
  ["left_knee",      "left_ankle"],
  ["left_ankle",     "left_foot_index"],
  // Right leg
  ["right_hip",      "right_knee"],
  ["right_knee",     "right_ankle"],
  ["right_ankle",    "right_foot_index"],
  // Head
  ["nose",           "left_shoulder"],
  ["nose",           "right_shoulder"],
];

// ---------------------------------------------------------------------------
// 2. COORDINATE NORMALIZATION
//    Origin  → mid-hip point
//    Scale   → torso length (mid-shoulder ↔ mid-hip distance)
//    Returns a new object with the same structure but normalized {x,y,z}
// ---------------------------------------------------------------------------

/**
 * Extract a single landmark by semantic name from the MediaPipe results array.
 * @param {Array}  landmarks  - Array of {x,y,z,visibility} from MediaPipe
 * @param {string} name       - Key in LANDMARK_MAP
 * @returns {{ x, y, z, visibility } | null}
 */
export function getLandmark(landmarks, name) {
  const idx = LANDMARK_MAP[name];
  if (idx === undefined || !landmarks[idx]) return null;
  return landmarks[idx];
}

/**
 * Normalize all landmarks to be body-relative and scale-invariant.
 * @param {Array} landmarks - Raw MediaPipe landmark array
 * @returns {Object} Mapping of name → {x, y, z, visibility} (normalized)
 */
export function normalizeLandmarks(landmarks) {
  const lHip  = getLandmark(landmarks, "left_hip");
  const rHip  = getLandmark(landmarks, "right_hip");
  const lSho  = getLandmark(landmarks, "left_shoulder");
  const rSho  = getLandmark(landmarks, "right_shoulder");

  if (!lHip || !rHip || !lSho || !rSho) return null;

  // Origin: mid-hip
  const origin = {
    x: (lHip.x + rHip.x) / 2,
    y: (lHip.y + rHip.y) / 2,
    z: (lHip.z + rHip.z) / 2,
  };

  // Torso length = distance from mid-hip to mid-shoulder
  const midSho = {
    x: (lSho.x + rSho.x) / 2,
    y: (lSho.y + rSho.y) / 2,
    z: (lSho.z + rSho.z) / 2,
  };
  const torsoLen = Math.sqrt(
    (midSho.x - origin.x) ** 2 +
    (midSho.y - origin.y) ** 2 +
    (midSho.z - origin.z) ** 2
  ) || 1;

  const normalized = {};
  for (const [name, idx] of Object.entries(LANDMARK_MAP)) {
    const lm = landmarks[idx];
    if (!lm) continue;
    normalized[name] = {
      x:          (lm.x - origin.x) / torsoLen,
      y:          (lm.y - origin.y) / torsoLen,
      z:          (lm.z - origin.z) / torsoLen,
      visibility: lm.visibility ?? 0,
    };
  }
  return normalized;
}

// ---------------------------------------------------------------------------
// 3. ANGLE CALCULATION
// ---------------------------------------------------------------------------

/**
 * Calculate the 3D angle at vertex B, formed by vectors BA and BC.
 * @param {{ x, y, z }} A
 * @param {{ x, y, z }} B  - vertex
 * @param {{ x, y, z }} C
 * @returns {number} Angle in degrees [0, 180]
 */
export function calculateAngle(A, B, C) {
  const BA = { x: A.x - B.x, y: A.y - B.y, z: (A.z ?? 0) - (B.z ?? 0) };
  const BC = { x: C.x - B.x, y: C.y - B.y, z: (C.z ?? 0) - (B.z ?? 0) };

  const dot = BA.x * BC.x + BA.y * BC.y + BA.z * BC.z;
  const magBA = Math.sqrt(BA.x ** 2 + BA.y ** 2 + BA.z ** 2);
  const magBC = Math.sqrt(BC.x ** 2 + BC.y ** 2 + BC.z ** 2);

  if (magBA === 0 || magBC === 0) return 0;

  // Clamp for numerical stability
  const cosTheta = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  return Math.acos(cosTheta) * (180 / Math.PI);
}

/**
 * Calculate a 2D angle (in the X-Y image plane) at B.
 * Useful for arm elevation, lateral trunk tilt.
 */
export function calculateAngle2D(A, B, C) {
  const BA = { x: A.x - B.x, y: A.y - B.y };
  const BC = { x: C.x - B.x, y: C.y - B.y };
  const dot = BA.x * BC.x + BA.y * BC.y;
  const magBA = Math.sqrt(BA.x ** 2 + BA.y ** 2);
  const magBC = Math.sqrt(BC.x ** 2 + BC.y ** 2);
  if (magBA === 0 || magBC === 0) return 0;
  const cos = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  return Math.acos(cos) * (180 / Math.PI);
}

// ---------------------------------------------------------------------------
// 4. VISIBILITY GATE
// ---------------------------------------------------------------------------

const MIN_CONFIDENCE = 0.55;

/**
 * Check if all listed landmarks are above the visibility threshold.
 * @param {Object} normalized - Output of normalizeLandmarks()
 * @param {string[]} names    - Landmark names to check
 * @param {number} threshold
 * @returns {boolean}
 */
export function areLandmarksVisible(normalized, names, threshold = MIN_CONFIDENCE) {
  for (const name of names) {
    const lm = normalized[name];
    if (!lm || (lm.visibility ?? 0) < threshold) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// 5. COMPUTE ALL JOINT ANGLES FOR A FRAME
//    Returns: { jointName: { angle, visible } }
// ---------------------------------------------------------------------------
import { JOINT_TRIPLETS } from "./pose_definitions.js";

/**
 * Compute all joint angles from normalized landmarks.
 * @param {Object} norm - Output of normalizeLandmarks()
 * @returns {Object}    - { jointName: { angle: number|null, visible: boolean } }
 */
export function computeJointAngles(norm) {
  const result = {};
  for (const [joint, [nameA, nameB, nameC]] of Object.entries(JOINT_TRIPLETS)) {
    const visible = areLandmarksVisible(norm, [nameA, nameB, nameC]);
    if (!visible) {
      result[joint] = { angle: null, visible: false };
      continue;
    }
    const A = norm[nameA], B = norm[nameB], C = norm[nameC];
    const angle = (joint.includes("elevation") || joint === "spine_tilt")
      ? calculateAngle2D(A, B, C)
      : calculateAngle(A, B, C);
    result[joint] = { angle: Math.round(angle * 10) / 10, visible: true };
  }
  return result;
}

// ---------------------------------------------------------------------------
// 6. EXPONENTIAL MOVING AVERAGE (EMA) TEMPORAL SMOOTHER
// ---------------------------------------------------------------------------

const EMA_ALPHA = 0.35;   // Lower = smoother, higher = more responsive

/**
 * State store for EMA — keyed by joint name.
 * @type {Object.<string, number>}
 */
let emaState = {};

/**
 * Apply EMA smoothing to a joint angle reading.
 * Automatically initializes state on first call for a joint.
 * @param {string} joint
 * @param {number} rawAngle
 * @returns {number} Smoothed angle
 */
export function smoothAngle(joint, rawAngle) {
  if (emaState[joint] === undefined) {
    emaState[joint] = rawAngle;
  } else {
    emaState[joint] = EMA_ALPHA * rawAngle + (1 - EMA_ALPHA) * emaState[joint];
  }
  return Math.round(emaState[joint] * 10) / 10;
}

/**
 * Reset all EMA state (call when changing pose or on reset).
 */
export function resetEMA() {
  emaState = {};
}

// ---------------------------------------------------------------------------
// 7. POSE SCORING ENGINE
// ---------------------------------------------------------------------------

const SCORE_THRESHOLD = 0.65;   // 65% weighted score = "correct"
const HOLD_DEBOUNCE_FRAMES = 5; // Frames before surfacing new feedback

/**
 * Evaluate a single pose against normalized joint angles.
 *
 * @param {Object} poseDefinition - From POSE_DEFINITIONS[poseKey]
 * @param {Object} angles         - { jointName: { angle, visible } } (EMA-smoothed)
 * @returns {Object} Evaluation result
 */
export function evaluatePose(poseDefinition, angles) {
  const joints = poseDefinition.joints;
  let totalWeight = 0;
  let correctWeight = 0;
  const jointResults = {};

  for (const [joint, spec] of Object.entries(joints)) {
    const { min, max, weight, cue_low, cue_high } = spec;
    const angleData = angles[joint];
    const w = weight ?? 1.0;
    totalWeight += w;

    if (!angleData || !angleData.visible || angleData.angle === null) {
      jointResults[joint] = {
        status:   "not_visible",
        angle:    null,
        target:   [min, max],
        correct:  false,
        cue:      "Move into frame so this joint is visible",
        weight:   w,
      };
      continue;
    }

    const angle = angleData.angle;
    const correct = angle >= min && angle <= max;
    if (correct) correctWeight += w;

    let cue = null;
    if (!correct) {
      cue = angle < min ? cue_low : cue_high;
    }

    jointResults[joint] = {
      status:  correct ? "correct" : "incorrect",
      angle,
      target:  [min, max],
      correct,
      cue,
      weight: w,
    };
  }

  const scoreRatio = totalWeight > 0 ? correctWeight / totalWeight : 0;
  const score = Math.round(scoreRatio * 100);
  const poseCorrect = scoreRatio >= SCORE_THRESHOLD;

  return {
    pose:     poseDefinition.description,
    score,
    correct:  poseCorrect,
    joints:   jointResults,
    feedback: collectFeedback(jointResults),
  };
}

/**
 * Collect human-readable feedback sorted by priority (incorrect first).
 */
function collectFeedback(jointResults) {
  return Object.entries(jointResults)
    .filter(([, r]) => !r.correct && r.cue)
    .sort(([, a], [, b]) => (b.weight ?? 1) - (a.weight ?? 1))
    .map(([joint, r]) => ({ joint, cue: r.cue, angle: r.angle, target: r.target }));
}

// ---------------------------------------------------------------------------
// 8. POSE AUTO-DETECTION (Angular Fingerprinting)
// ---------------------------------------------------------------------------
import { POSE_DEFINITIONS } from "./pose_definitions.js";

/**
 * Compare the live angle vector against all pose definitions and return
 * the best matching pose key, or "unknown" if confidence is low.
 *
 * Uses mean squared error over weighted joints.
 *
 * @param {Object} angles - { jointName: { angle, visible } }
 * @param {number} maxMSE - MSE threshold above which we return "unknown"
 * @returns {{ bestPose: string, confidence: number }}
 */
export function detectPose(angles, maxMSE = 900) {
  let bestPose  = "unknown";
  let bestMSE   = Infinity;

  for (const [poseKey, pose] of Object.entries(POSE_DEFINITIONS)) {
    let mse = 0;
    let count = 0;

    for (const [joint, spec] of Object.entries(pose.joints)) {
      const a = angles[joint];
      if (!a || !a.visible || a.angle === null) continue;
      const target = (spec.min + spec.max) / 2;
      mse += (a.angle - target) ** 2 * (spec.weight ?? 1);
      count++;
    }

    if (count === 0) continue;
    mse /= count;
    if (mse < bestMSE) {
      bestMSE  = mse;
      bestPose = poseKey;
    }
  }

  const confidence = Math.max(0, Math.round((1 - bestMSE / maxMSE) * 100));
  return { bestPose: bestMSE > maxMSE ? "unknown" : bestPose, confidence };
}

// ---------------------------------------------------------------------------
// 9. DEBOUNCE STATE TRACKER
//    Prevents flickering by requiring N consecutive incorrect frames.
// ---------------------------------------------------------------------------

const debounceStates = {};

/**
 * Returns true only if a joint has been incorrect for >= debounceFrames.
 * @param {string}  key
 * @param {boolean} isCorrect
 * @param {number}  debounceFrames
 * @returns {boolean} Whether the incorrect state should be surfaced
 */
export function debounceJoint(key, isCorrect, debounceFrames = HOLD_DEBOUNCE_FRAMES) {
  if (!debounceStates[key]) debounceStates[key] = 0;
  if (isCorrect) {
    debounceStates[key] = 0;
    return true;
  }
  debounceStates[key]++;
  return debounceStates[key] >= debounceFrames;
}

export function resetDebounce() {
  Object.keys(debounceStates).forEach(k => delete debounceStates[k]);
}
