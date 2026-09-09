"""
yoga_engine.py
Python reference implementation — Yoga Pose Detection & Form Correction

Matches the exact same 30-landmark → angle → pose-evaluation pipeline
as the JavaScript web application. Runs on webcam or static video/image.

Requirements:
    pip install mediapipe opencv-python numpy

Usage:
    # Live webcam demo (default):
    python yoga_engine.py

    # Specific pose + webcam:
    python yoga_engine.py --pose warrior_2

    # From a video file:
    python yoga_engine.py --source /path/to/video.mp4

    # Headless evaluation of a single image:
    python yoga_engine.py --image /path/to/image.jpg --pose downward_dog

    # List available poses:
    python yoga_engine.py --list
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import cv2
import mediapipe as mp
import numpy as np

# ═══════════════════════════════════════════════════════════════════════════
# 1. LANDMARK MAP  (30 body points, MediaPipe indices)
# ═══════════════════════════════════════════════════════════════════════════

LANDMARK_MAP: Dict[str, int] = {
    "nose":               0,
    "left_eye_inner":     1,
    "left_eye":           2,
    "left_eye_outer":     3,
    "right_eye_inner":    4,
    "right_eye":          5,
    "right_eye_outer":    6,
    "left_ear":           7,
    "right_ear":          8,
    "mouth_left":         9,
    "mouth_right":        10,
    "left_shoulder":      11,
    "right_shoulder":     12,
    "left_elbow":         13,
    "right_elbow":        14,
    "left_wrist":         15,
    "right_wrist":        16,
    "left_pinky":         17,
    "right_pinky":        18,
    "left_index":         19,
    "right_index":        20,
    "left_thumb":         21,
    "right_thumb":        22,
    "left_hip":           23,
    "right_hip":          24,
    "left_knee":          25,
    "right_knee":         26,
    "left_ankle":         27,
    "right_ankle":        28,
    "left_foot_index":    31,
    "right_foot_index":   32,
}

SKELETON_CONNECTIONS: List[Tuple[str, str]] = [
    ("left_shoulder", "right_shoulder"),
    ("left_shoulder", "left_hip"),
    ("right_shoulder", "right_hip"),
    ("left_hip", "right_hip"),
    ("left_shoulder", "left_elbow"),
    ("left_elbow", "left_wrist"),
    ("right_shoulder", "right_elbow"),
    ("right_elbow", "right_wrist"),
    ("left_hip", "left_knee"),
    ("left_knee", "left_ankle"),
    ("left_ankle", "left_foot_index"),
    ("right_hip", "right_knee"),
    ("right_knee", "right_ankle"),
    ("right_ankle", "right_foot_index"),
]

# ═══════════════════════════════════════════════════════════════════════════
# 2. POSE DEFINITIONS
# ═══════════════════════════════════════════════════════════════════════════

@dataclass
class JointSpec:
    min_angle: float
    max_angle: float
    weight: float = 1.0
    cue_low: str  = ""
    cue_high: str = ""


@dataclass
class PoseDefinition:
    description: str
    emoji: str
    hold_target: int
    joints: Dict[str, JointSpec]


POSE_DEFINITIONS: Dict[str, PoseDefinition] = {
    "warrior_2": PoseDefinition(
        description="Warrior II (Virabhadrasana II)", emoji="⚔️", hold_target=30,
        joints={
            "left_knee":          JointSpec(80,  105, 2.0, "Bend your left knee more", "Reduce left knee bend"),
            "right_knee":         JointSpec(165, 180, 2.0, "Straighten right (back) leg", "Straighten right leg"),
            "left_elbow":         JointSpec(160, 180, 1.5, "Extend left arm fully", "Extend left arm"),
            "right_elbow":        JointSpec(160, 180, 1.5, "Extend right arm fully", "Extend right arm"),
            "left_arm_elevation": JointSpec(75,  100, 1.2, "Raise left arm to shoulder height", "Lower left arm"),
            "right_arm_elevation":JointSpec(75,  100, 1.2, "Raise right arm to shoulder height", "Lower right arm"),
            "left_hip":           JointSpec(85,  100, 1.0, "Open your hips sideways", "Keep torso upright"),
        },
    ),
    "tree_pose": PoseDefinition(
        description="Tree Pose (Vrksasana)", emoji="🌳", hold_target=30,
        joints={
            "right_knee":  JointSpec(165, 180, 2.5, "Straighten standing leg", "Straighten standing leg"),
            "left_knee":   JointSpec(35,  70,  2.5, "Bend lifted knee outward", "Open knee more to the side"),
            "left_elbow":  JointSpec(155, 180, 1.0, "Straighten arms overhead", "Straighten arms overhead"),
            "right_elbow": JointSpec(155, 180, 1.0, "Straighten arms overhead", "Straighten arms overhead"),
            "right_hip":   JointSpec(165, 180, 1.5, "Stand tall — don't bend at hip", "Stand tall"),
        },
    ),
    "downward_dog": PoseDefinition(
        description="Downward Dog (Adho Mukha Svanasana)", emoji="🐕", hold_target=20,
        joints={
            "left_hip":    JointSpec(70,  95,  2.5, "Lift hips higher", "Push hips upward"),
            "right_hip":   JointSpec(70,  95,  2.5, "Lift hips higher", "Push hips upward"),
            "left_knee":   JointSpec(165, 180, 2.0, "Straighten left leg", "Straighten left leg"),
            "right_knee":  JointSpec(165, 180, 2.0, "Straighten right leg", "Straighten right leg"),
            "left_elbow":  JointSpec(165, 180, 1.5, "Lock left elbow", "Lock left elbow"),
            "right_elbow": JointSpec(165, 180, 1.5, "Lock right elbow", "Lock right elbow"),
        },
    ),
    "plank": PoseDefinition(
        description="Plank (Phalakasana)", emoji="🏋️", hold_target=30,
        joints={
            "left_hip":    JointSpec(165, 185, 3.0, "Raise hips — don't sag", "Lower hips — don't pike"),
            "right_hip":   JointSpec(165, 185, 3.0, "Raise hips — don't sag", "Lower hips — don't pike"),
            "left_knee":   JointSpec(165, 180, 2.0, "Lock left knee", "Lock left knee"),
            "right_knee":  JointSpec(165, 180, 2.0, "Lock right knee", "Lock right knee"),
            "left_elbow":  JointSpec(165, 180, 1.5, "Straighten left arm", "Straighten left arm"),
            "right_elbow": JointSpec(165, 180, 1.5, "Straighten right arm", "Straighten right arm"),
        },
    ),
    "cobra": PoseDefinition(
        description="Cobra (Bhujangasana)", emoji="🐍", hold_target=15,
        joints={
            "left_elbow":    JointSpec(110, 160, 2.0, "Bend elbows more", "Don't hyper-extend"),
            "right_elbow":   JointSpec(110, 160, 2.0, "Bend elbows more", "Don't hyper-extend"),
            "left_knee":     JointSpec(168, 180, 1.5, "Keep left leg flat", "Keep left leg flat"),
            "right_knee":    JointSpec(168, 180, 1.5, "Keep right leg flat", "Keep right leg flat"),
            "left_shoulder": JointSpec(30,  75,  1.5, "Lift chest higher", "Reduce backbend"),
            "right_shoulder":JointSpec(30,  75,  1.5, "Lift chest higher", "Reduce backbend"),
        },
    ),
    "goddess": PoseDefinition(
        description="Goddess (Utkata Konasana)", emoji="🌟", hold_target=20,
        joints={
            "left_knee":    JointSpec(85,  110, 2.5, "Bend left knee more (target 90°)", "Knee past foot"),
            "right_knee":   JointSpec(85,  110, 2.5, "Bend right knee more (target 90°)", "Knee past foot"),
            "left_elbow":   JointSpec(85,  105, 1.5, "Raise left arm to cactus", "Bend left elbow more"),
            "right_elbow":  JointSpec(85,  105, 1.5, "Raise right arm to cactus", "Bend right elbow more"),
            "left_shoulder":JointSpec(80,  100, 1.2, "Raise left arm to shoulder height", "Lower left arm"),
            "right_shoulder":JointSpec(80, 100, 1.2, "Raise right arm to shoulder height", "Lower right arm"),
        },
    ),
    "triangle": PoseDefinition(
        description="Triangle (Trikonasana)", emoji="△", hold_target=25,
        joints={
            "left_knee":   JointSpec(168, 180, 2.5, "Straighten front leg", "Straighten front leg"),
            "right_knee":  JointSpec(168, 180, 2.5, "Straighten back leg", "Straighten back leg"),
            "left_hip":    JointSpec(78,  105, 2.0, "Lean torso more sideways", "Don't lean too far"),
            "left_elbow":  JointSpec(162, 180, 1.5, "Extend left arm fully", "Extend left arm"),
            "right_elbow": JointSpec(162, 180, 1.5, "Reach right arm straight up", "Reach right arm up"),
        },
    ),
}

# Joint triplets [A, B (vertex), C]
JOINT_TRIPLETS: Dict[str, Tuple[str, str, str]] = {
    "left_elbow":         ("left_shoulder",   "left_elbow",    "left_wrist"),
    "right_elbow":        ("right_shoulder",  "right_elbow",   "right_wrist"),
    "left_shoulder":      ("left_elbow",      "left_shoulder", "left_hip"),
    "right_shoulder":     ("right_elbow",     "right_shoulder","right_hip"),
    "left_hip":           ("left_shoulder",   "left_hip",      "left_knee"),
    "right_hip":          ("right_shoulder",  "right_hip",     "right_knee"),
    "left_knee":          ("left_hip",        "left_knee",     "left_ankle"),
    "right_knee":         ("right_hip",       "right_knee",    "right_ankle"),
    "left_ankle":         ("left_knee",       "left_ankle",    "left_foot_index"),
    "right_ankle":        ("right_knee",      "right_ankle",   "right_foot_index"),
    "left_arm_elevation": ("left_wrist",      "left_shoulder", "left_hip"),
    "right_arm_elevation":("right_wrist",     "right_shoulder","right_hip"),
    "spine_tilt":         ("left_shoulder",   "right_shoulder","left_hip"),
}

# ═══════════════════════════════════════════════════════════════════════════
# 3. GEOMETRY FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════

def get_lm(landmarks, name: str) -> Optional[np.ndarray]:
    """Extract a landmark as [x, y, z, visibility] or None."""
    idx = LANDMARK_MAP.get(name)
    if idx is None or idx >= len(landmarks):
        return None
    lm = landmarks[idx]
    return np.array([lm.x, lm.y, lm.z, lm.visibility])


def normalize_landmarks(landmarks) -> Optional[Dict[str, np.ndarray]]:
    """Translate to mid-hip origin, scale by torso length."""
    l_hip  = get_lm(landmarks, "left_hip")
    r_hip  = get_lm(landmarks, "right_hip")
    l_sho  = get_lm(landmarks, "left_shoulder")
    r_sho  = get_lm(landmarks, "right_shoulder")

    if any(x is None for x in [l_hip, r_hip, l_sho, r_sho]):
        return None

    origin    = (l_hip[:3] + r_hip[:3]) / 2
    mid_sho   = (l_sho[:3] + r_sho[:3]) / 2
    torso_len = np.linalg.norm(mid_sho - origin) or 1.0

    result = {}
    for name, idx in LANDMARK_MAP.items():
        if idx >= len(landmarks):
            continue
        lm = landmarks[idx]
        xyz = np.array([lm.x, lm.y, lm.z])
        result[name] = {
            "xyz": (xyz - origin) / torso_len,
            "visibility": lm.visibility,
        }
    return result


def calculate_angle(A: np.ndarray, B: np.ndarray, C: np.ndarray) -> float:
    """3D angle at vertex B between vectors BA and BC, in degrees."""
    ba = A - B
    bc = C - B
    mag_ba = np.linalg.norm(ba)
    mag_bc = np.linalg.norm(bc)
    if mag_ba == 0 or mag_bc == 0:
        return 0.0
    cos_theta = np.clip(np.dot(ba, bc) / (mag_ba * mag_bc), -1.0, 1.0)
    return float(np.degrees(np.arccos(cos_theta)))


MIN_CONFIDENCE = 0.55


def compute_joint_angles(norm: Dict) -> Dict[str, Dict]:
    """Compute all tracked joint angles from normalized landmarks."""
    result = {}
    for joint, (nameA, nameB, nameC) in JOINT_TRIPLETS.items():
        lmA = norm.get(nameA)
        lmB = norm.get(nameB)
        lmC = norm.get(nameC)
        if not all([lmA, lmB, lmC]):
            result[joint] = {"angle": None, "visible": False}
            continue
        if any(lm["visibility"] < MIN_CONFIDENCE for lm in [lmA, lmB, lmC]):
            result[joint] = {"angle": None, "visible": False}
            continue
        angle = calculate_angle(lmA["xyz"], lmB["xyz"], lmC["xyz"])
        result[joint] = {"angle": round(angle, 1), "visible": True}
    return result


# ═══════════════════════════════════════════════════════════════════════════
# 4. EMA TEMPORAL SMOOTHER
# ═══════════════════════════════════════════════════════════════════════════

EMA_ALPHA = 0.35


class EMASmoother:
    def __init__(self, alpha: float = EMA_ALPHA):
        self.alpha = alpha
        self._state: Dict[str, float] = {}

    def smooth(self, joint: str, raw: float) -> float:
        if joint not in self._state:
            self._state[joint] = raw
        else:
            self._state[joint] = self.alpha * raw + (1 - self.alpha) * self._state[joint]
        return round(self._state[joint], 1)

    def reset(self):
        self._state.clear()


# ═══════════════════════════════════════════════════════════════════════════
# 5. DEBOUNCE STATE
# ═══════════════════════════════════════════════════════════════════════════

DEBOUNCE_FRAMES = 5


class DebounceTracker:
    def __init__(self, frames: int = DEBOUNCE_FRAMES):
        self.frames = frames
        self._counts: Dict[str, int] = {}

    def is_surfaced(self, joint: str, is_correct: bool) -> bool:
        if is_correct:
            self._counts[joint] = 0
            return True
        self._counts[joint] = self._counts.get(joint, 0) + 1
        return self._counts[joint] >= self.frames

    def reset(self):
        self._counts.clear()


# ═══════════════════════════════════════════════════════════════════════════
# 6. POSE EVALUATOR
# ═══════════════════════════════════════════════════════════════════════════

SCORE_THRESHOLD = 0.65


def evaluate_pose(pose_def: PoseDefinition, angles: Dict) -> Dict:
    """Evaluate all joints in a pose and return a structured result."""
    joint_results = {}
    total_weight  = 0.0
    correct_weight = 0.0

    for joint, spec in pose_def.joints.items():
        a_data = angles.get(joint, {})
        w = spec.weight
        total_weight += w

        if not a_data.get("visible") or a_data.get("angle") is None:
            joint_results[joint] = {
                "status":  "not_visible",
                "angle":   None,
                "target":  [spec.min_angle, spec.max_angle],
                "correct": False,
                "cue":     "Move into frame so this joint is visible",
                "weight":  w,
            }
            continue

        angle = a_data["angle"]
        correct = spec.min_angle <= angle <= spec.max_angle
        if correct:
            correct_weight += w

        cue = None
        if not correct:
            cue = spec.cue_low if angle < spec.min_angle else spec.cue_high

        joint_results[joint] = {
            "status":  "correct" if correct else "incorrect",
            "angle":   angle,
            "target":  [spec.min_angle, spec.max_angle],
            "correct": correct,
            "cue":     cue,
            "weight":  w,
        }

    score_ratio = correct_weight / total_weight if total_weight > 0 else 0.0
    score = round(score_ratio * 100)
    pose_correct = score_ratio >= SCORE_THRESHOLD

    feedback = [
        {"joint": j, "cue": r["cue"], "angle": r["angle"], "target": r["target"]}
        for j, r in sorted(joint_results.items(), key=lambda x: -x[1]["weight"])
        if not r["correct"] and r.get("cue")
    ]

    return {
        "pose":     pose_def.description,
        "score":    score,
        "correct":  pose_correct,
        "joints":   joint_results,
        "feedback": feedback,
    }


def detect_pose(angles: Dict, max_mse: float = 900.0) -> Dict:
    """Auto-detect pose from angle fingerprint (MSE against all definitions)."""
    best_pose  = "unknown"
    best_mse   = math.inf

    for key, pose_def in POSE_DEFINITIONS.items():
        mse   = 0.0
        count = 0
        for joint, spec in pose_def.joints.items():
            a_data = angles.get(joint, {})
            if not a_data.get("visible") or a_data.get("angle") is None:
                continue
            target = (spec.min_angle + spec.max_angle) / 2
            mse += (a_data["angle"] - target) ** 2 * spec.weight
            count += 1
        if count == 0:
            continue
        mse /= count
        if mse < best_mse:
            best_mse  = mse
            best_pose = key

    confidence = max(0, round((1 - best_mse / max_mse) * 100))
    return {
        "best_pose":  best_pose if best_mse <= max_mse else "unknown",
        "confidence": confidence,
        "mse":        best_mse,
    }


# ═══════════════════════════════════════════════════════════════════════════
# 7. OPENCV RENDERER
# ═══════════════════════════════════════════════════════════════════════════

# BGR colors
COLOR_CORRECT   = (0, 229, 160)
COLOR_INCORRECT = (77,  77, 255)
COLOR_INVISIBLE = (100, 100, 100)
COLOR_BONE      = (180, 180, 180)
COLOR_BG        = (20,  20,  35)


def draw_skeleton(frame: np.ndarray, landmarks, joint_results: Dict) -> np.ndarray:
    h, w = frame.shape[:2]

    def pt(name: str):
        idx = LANDMARK_MAP.get(name)
        if idx is None or idx >= len(landmarks):
            return None
        lm = landmarks[idx]
        if lm.visibility < 0.4:
            return None
        return (int(lm.x * w), int(lm.y * h))

    # Draw bones
    for nameA, nameB in SKELETON_CONNECTIONS:
        pA, pB = pt(nameA), pt(nameB)
        if pA and pB:
            cv2.line(frame, pA, pB, COLOR_BONE, 2, cv2.LINE_AA)

    # Draw joints
    KEY_JOINTS = set(JOINT_TRIPLETS.keys()) | {
        "left_shoulder", "right_shoulder", "left_hip", "right_hip", "nose"
    }
    for name in KEY_JOINTS:
        p = pt(name)
        if not p:
            continue
        jr = joint_results.get(name)
        if jr:
            color  = COLOR_CORRECT if jr["correct"] else COLOR_INCORRECT
            radius = 9
        else:
            color  = (200, 200, 200)
            radius = 5

        cv2.circle(frame, p, radius + 3, (0, 0, 0), -1, cv2.LINE_AA)  # shadow
        cv2.circle(frame, p, radius, color, -1, cv2.LINE_AA)

        # Angle label
        if jr and jr.get("angle") is not None:
            cv2.putText(frame, f"{int(jr['angle'])}°",
                        (p[0] + 10, p[1] - 5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.42, color, 1, cv2.LINE_AA)
    return frame


def draw_hud(frame: np.ndarray, eval_result: Dict) -> np.ndarray:
    """Overlay score, status, and top correction cues."""
    h, w = frame.shape[:2]

    # Semi-transparent HUD background (top strip)
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (w, 56), (10, 12, 25), -1)
    cv2.addWeighted(overlay, 0.72, frame, 0.28, 0, frame)

    score   = eval_result.get("score", 0)
    correct = eval_result.get("correct", False)
    pose    = eval_result.get("pose", "")

    status_color = COLOR_CORRECT if correct else COLOR_INCORRECT
    status_text  = "CORRECT" if correct else "ADJUST"

    cv2.putText(frame, pose, (12, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.55,
                (220, 225, 240), 1, cv2.LINE_AA)
    cv2.putText(frame, f"Score: {score}%  [{status_text}]", (12, 46),
                cv2.FONT_HERSHEY_SIMPLEX, 0.52, status_color, 1, cv2.LINE_AA)

    # Feedback cues bottom strip
    feedback = eval_result.get("feedback", [])[:3]
    if feedback:
        strip = frame.copy()
        cv2.rectangle(strip, (0, h - 30 * len(feedback) - 10), (w, h), (10, 12, 25), -1)
        cv2.addWeighted(strip, 0.72, frame, 0.28, 0, frame)
        for i, item in enumerate(feedback):
            text = f"→ {item['joint'].replace('_',' ')}: {item['cue']}"
            cv2.putText(frame, text, (12, h - 12 - i * 28),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.44, (77, 200, 255), 1, cv2.LINE_AA)

    return frame


# ═══════════════════════════════════════════════════════════════════════════
# 8. MAIN PIPELINE
# ═══════════════════════════════════════════════════════════════════════════

def run(source=0, pose_key: str = "warrior_2", auto_detect: bool = False,
        image_path: str = None, headless: bool = False):
    """Main processing loop."""
    mp_pose = mp.solutions.pose
    smoother  = EMASmoother()
    debouncer = DebounceTracker()
    fps_times: deque = deque(maxlen=30)

    with mp_pose.Pose(
        model_complexity=1,
        smooth_landmarks=True,
        min_detection_confidence=0.55,
        min_tracking_confidence=0.55,
    ) as pose_model:

        # ── Image mode ───────────────────────────────────────────────
        if image_path:
            img = cv2.imread(image_path)
            if img is None:
                print(f"[ERROR] Cannot read image: {image_path}", file=sys.stderr)
                return
            rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            results = pose_model.process(rgb)
            if not results.pose_landmarks:
                print("[WARN] No person detected in image.")
                return
            lms  = results.pose_landmarks.landmark
            norm = normalize_landmarks(lms)
            if norm:
                raw_angles = compute_joint_angles(norm)
                angles = {j: {"angle": smoother.smooth(j, d["angle"]), "visible": True}
                          if d["visible"] and d["angle"] is not None else d
                          for j, d in raw_angles.items()}
                key = (detect_pose(angles)["best_pose"] if auto_detect else pose_key)
                result = evaluate_pose(POSE_DEFINITIONS[key], angles)
                print(json.dumps(result, indent=2, default=str))
                if not headless:
                    draw_skeleton(img, lms, {j: r for j, r in result["joints"].items()})
                    draw_hud(img, result)
                    cv2.imshow("YogaLens", img)
                    cv2.waitKey(0)
                    cv2.destroyAllWindows()
            return

        # ── Video / Camera loop ──────────────────────────────────────
        cap = cv2.VideoCapture(source)
        if not cap.isOpened():
            print(f"[ERROR] Cannot open source: {source}", file=sys.stderr)
            return

        print(f"\n🧘 YogaLens started. Pose: {POSE_DEFINITIONS[pose_key].description}")
        print("   Press Q or ESC to quit | A to toggle auto-detect | R to reset\n")

        hold_start: Optional[float] = None

        while True:
            t0 = time.perf_counter()
            ret, frame = cap.read()
            if not ret:
                break

            frame = cv2.flip(frame, 1)
            rgb   = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = pose_model.process(rgb)

            eval_result = None
            if results.pose_landmarks:
                lms  = results.pose_landmarks.landmark
                norm = normalize_landmarks(lms)
                if norm:
                    raw_angles = compute_joint_angles(norm)
                    angles = {}
                    for j, d in raw_angles.items():
                        if d["visible"] and d["angle"] is not None:
                            angles[j] = {"angle": smoother.smooth(j, d["angle"]), "visible": True}
                        else:
                            angles[j] = d

                    active_key = pose_key
                    if auto_detect:
                        det = detect_pose(angles)
                        if det["best_pose"] != "unknown":
                            active_key = det["best_pose"]

                    eval_result = evaluate_pose(POSE_DEFINITIONS[active_key], angles)

                    # Debounce joint display
                    for joint, jdata in eval_result["joints"].items():
                        surfaced = debouncer.is_surfaced(joint, jdata["correct"])
                        if not surfaced and not jdata["correct"]:
                            eval_result["joints"][joint]["status"] = "correct"

                    # Hold timer
                    if eval_result["correct"]:
                        if hold_start is None:
                            hold_start = time.time()
                        hold_s = time.time() - hold_start
                        ht     = POSE_DEFINITIONS[active_key].hold_target
                        if hold_s >= ht:
                            cv2.putText(frame, "✓ POSE COMPLETE! Great work!",
                                        (40, frame.shape[0] // 2),
                                        cv2.FONT_HERSHEY_SIMPLEX, 1.1,
                                        COLOR_CORRECT, 2, cv2.LINE_AA)
                    else:
                        hold_start = None

                    draw_skeleton(frame, lms, eval_result["joints"])
                    draw_hud(frame, eval_result)
            else:
                cv2.putText(frame, "No person detected", (20, 36),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, COLOR_INVISIBLE, 1)

            # FPS
            fps_times.append(time.perf_counter() - t0)
            fps = round(1 / (sum(fps_times) / len(fps_times)))
            cv2.putText(frame, f"{fps} FPS", (frame.shape[1] - 80, 22),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (140, 140, 160), 1)

            if not headless:
                cv2.imshow("YogaLens", frame)
                key = cv2.waitKey(1) & 0xFF
                if key in (ord("q"), 27):
                    break
                if key == ord("a"):
                    auto_detect = not auto_detect
                    print(f"Auto-detect: {'ON' if auto_detect else 'OFF'}")
                if key == ord("r"):
                    smoother.reset()
                    debouncer.reset()
                    hold_start = None
                    print("Reset.")

        cap.release()
        cv2.destroyAllWindows()


# ═══════════════════════════════════════════════════════════════════════════
# 9. CLI ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="YogaLens — Real-time yoga pose detection & form correction"
    )
    parser.add_argument("--pose",   default="warrior_2",
                        help="Pose key to evaluate (default: warrior_2)")
    parser.add_argument("--source", default=0,
                        help="Camera index (0) or video file path")
    parser.add_argument("--image",  default=None,
                        help="Path to a static image for one-shot evaluation")
    parser.add_argument("--auto",   action="store_true",
                        help="Enable auto pose detection")
    parser.add_argument("--headless", action="store_true",
                        help="Suppress display windows (for server/CI use)")
    parser.add_argument("--list",   action="store_true",
                        help="List all available pose keys and exit")
    args = parser.parse_args()

    if args.list:
        print("\nAvailable yoga poses:")
        for key, p in POSE_DEFINITIONS.items():
            print(f"  {key:<20} {p.emoji} {p.description}")
        sys.exit(0)

    if args.pose not in POSE_DEFINITIONS:
        print(f"[ERROR] Unknown pose '{args.pose}'. Run with --list to see options.",
              file=sys.stderr)
        sys.exit(1)

    source = int(args.source) if str(args.source).isdigit() else args.source

    run(
        source=source,
        pose_key=args.pose,
        auto_detect=args.auto,
        image_path=args.image,
        headless=args.headless,
    )
