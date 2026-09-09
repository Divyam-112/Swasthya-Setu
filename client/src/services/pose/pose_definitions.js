/**
 * pose_definitions.js
 * Yoga Pose Angle Library — 7 Asanas
 *
 * Each pose entry:
 *   joints: { jointName: { min, max, weight, cue } }
 *   description: Human-readable name
 *   holdTarget: Recommended hold time in seconds
 *
 * Angle ranges derived from biomechanical references and
 * standard yoga anatomy literature (Leslie Kaminoff, "Yoga Anatomy").
 */

"use strict";

// ---------------------------------------------------------------------------
// Joint triplet definitions — [A, B, C] index keys in LANDMARK_MAP
// B is the vertex (the joint being measured).
// ---------------------------------------------------------------------------
export const JOINT_TRIPLETS = {
  // Upper body
  left_elbow:    ["left_shoulder",  "left_elbow",    "left_wrist"],
  right_elbow:   ["right_shoulder", "right_elbow",   "right_wrist"],
  left_shoulder: ["left_elbow",     "left_shoulder",  "left_hip"],
  right_shoulder:["right_elbow",    "right_shoulder", "right_hip"],

  // Trunk / spine
  left_hip:      ["left_shoulder",  "left_hip",      "left_knee"],
  right_hip:     ["right_shoulder", "right_hip",     "right_knee"],
  spine_tilt:    ["left_shoulder",  "right_shoulder","left_hip"],   // lateral inclination

  // Lower body
  left_knee:     ["left_hip",       "left_knee",     "left_ankle"],
  right_knee:    ["right_hip",      "right_knee",    "right_ankle"],
  left_ankle:    ["left_knee",      "left_ankle",    "left_foot_index"],
  right_ankle:   ["right_knee",     "right_ankle",   "right_foot_index"],

  // Elevation / abduction angles (2-point, referenced to vertical/horizontal)
  left_arm_elevation: ["left_wrist", "left_shoulder", "left_hip"],
  right_arm_elevation:["right_wrist","right_shoulder","right_hip"],
};

// ---------------------------------------------------------------------------
// Pose Definitions
// ---------------------------------------------------------------------------
export const POSE_DEFINITIONS = {

  // ── Warrior II — Virabhadrasana II ──────────────────────────────────────
  warrior_2: {
    description: "Warrior II (Virabhadrasana II)",
    emoji: "⚔️",
    image: "/poses/warrior_2.jpg",
    holdTarget: 30,
    joints: {
      left_knee: {
        min: 80, max: 105,
        weight: 2.0,
        cue_low:  "Bend your left knee more (target ~90°)",
        cue_high: "Don't let your left knee collapse inward — reduce bend",
      },
      right_knee: {
        min: 165, max: 180,
        weight: 2.0,
        cue_low:  "Straighten your right (back) leg",
        cue_high: "Straighten your right (back) leg fully",
      },
      left_elbow: {
        min: 160, max: 180,
        weight: 1.5,
        cue_low:  "Extend your left arm fully — lock the elbow",
        cue_high: "Extend your left arm fully",
      },
      right_elbow: {
        min: 160, max: 180,
        weight: 1.5,
        cue_low:  "Extend your right arm fully — lock the elbow",
        cue_high: "Extend your right arm fully",
      },
      left_arm_elevation: {
        min: 75, max: 100,
        weight: 1.2,
        cue_low:  "Raise your left arm to shoulder height",
        cue_high: "Lower your left arm to shoulder height",
      },
      right_arm_elevation: {
        min: 75, max: 100,
        weight: 1.2,
        cue_low:  "Raise your right arm to shoulder height",
        cue_high: "Lower your right arm to shoulder height",
      },
      left_hip: {
        min: 85, max: 100,
        weight: 1.0,
        cue_low:  "Open your hips — face sideways",
        cue_high: "Keep torso upright — do not lean forward",
      },
    },
  },

  // ── Tree Pose — Vrksasana ────────────────────────────────────────────────
  tree_pose: {
    description: "Tree Pose (Vrksasana)",
    emoji: "🌳",
    image: "/poses/tree_pose.jpg",
    holdTarget: 30,
    joints: {
      right_knee: {
        min: 165, max: 180,
        weight: 2.5,
        cue_low:  "Straighten your standing (right) leg",
        cue_high: "Straighten your standing (right) leg",
      },
      left_knee: {
        min: 35, max: 70,
        weight: 2.5,
        cue_low:  "Bend your lifted (left) knee outward more",
        cue_high: "Your knee is too far back — open it to the side",
      },
      left_elbow: {
        min: 155, max: 180,
        weight: 1.0,
        cue_low:  "Straighten your arms overhead",
        cue_high: "Straighten your arms overhead",
      },
      right_elbow: {
        min: 155, max: 180,
        weight: 1.0,
        cue_low:  "Straighten your arms overhead",
        cue_high: "Straighten your arms overhead",
      },
      right_hip: {
        min: 165, max: 180,
        weight: 1.5,
        cue_low:  "Stand tall — don't bend at the hip",
        cue_high: "Stand tall — don't bend at the hip",
      },
    },
  },

  // ── Downward-Facing Dog — Adho Mukha Svanasana ──────────────────────────
  downward_dog: {
    description: "Downward Dog (Adho Mukha Svanasana)",
    emoji: "🐕",
    image: "/poses/downward_dog.jpg",
    holdTarget: 20,
    joints: {
      left_hip: {
        min: 70, max: 95,
        weight: 2.5,
        cue_low:  "Lift your hips higher — press up and back",
        cue_high: "Don't drop your hips — push them upward",
      },
      right_hip: {
        min: 70, max: 95,
        weight: 2.5,
        cue_low:  "Lift your hips higher — press up and back",
        cue_high: "Don't drop your hips — push them upward",
      },
      left_knee: {
        min: 165, max: 180,
        weight: 2.0,
        cue_low:  "Straighten your left leg — extend the heel down",
        cue_high: "Straighten your left leg",
      },
      right_knee: {
        min: 165, max: 180,
        weight: 2.0,
        cue_low:  "Straighten your right leg — extend the heel down",
        cue_high: "Straighten your right leg",
      },
      left_elbow: {
        min: 165, max: 180,
        weight: 1.5,
        cue_low:  "Lock your left elbow — straighten the arm",
        cue_high: "Lock your left elbow — straighten the arm",
      },
      right_elbow: {
        min: 165, max: 180,
        weight: 1.5,
        cue_low:  "Lock your right elbow — straighten the arm",
        cue_high: "Lock your right elbow — straighten the arm",
      },
    },
  },

  // ── Plank Pose — Phalakasana ─────────────────────────────────────────────
  plank: {
    description: "Plank (Phalakasana)",
    emoji: "🪵",
    image: "/poses/plank.jpg",
    holdTarget: 30,
    joints: {
      left_hip: {
        min: 165, max: 185,
        weight: 3.0,
        cue_low:  "Raise your hips — don't sag in the middle",
        cue_high: "Lower your hips — don't pike up",
      },
      right_hip: {
        min: 165, max: 185,
        weight: 3.0,
        cue_low:  "Raise your hips — don't sag in the middle",
        cue_high: "Lower your hips — don't pike up",
      },
      left_knee: {
        min: 165, max: 180,
        weight: 2.0,
        cue_low:  "Lock your left knee — keep the leg straight",
        cue_high: "Lock your left knee — keep the leg straight",
      },
      right_knee: {
        min: 165, max: 180,
        weight: 2.0,
        cue_low:  "Lock your right knee — keep the leg straight",
        cue_high: "Lock your right knee — keep the leg straight",
      },
      left_elbow: {
        min: 165, max: 180,
        weight: 1.5,
        cue_low:  "Straighten your left arm fully",
        cue_high: "Straighten your left arm fully",
      },
      right_elbow: {
        min: 165, max: 180,
        weight: 1.5,
        cue_low:  "Straighten your right arm fully",
        cue_high: "Straighten your right arm fully",
      },
    },
  },

  // ── Cobra Pose — Bhujangasana ────────────────────────────────────────────
  cobra: {
    description: "Cobra (Bhujangasana)",
    emoji: "🐍",
    image: "/poses/cobra.jpg",
    holdTarget: 15,
    joints: {
      left_elbow: {
        min: 110, max: 160,
        weight: 2.0,
        cue_low:  "Bend elbows more — don't fully lock out",
        cue_high: "Don't hyper-extend — keep slight elbow bend",
      },
      right_elbow: {
        min: 110, max: 160,
        weight: 2.0,
        cue_low:  "Bend elbows more — don't fully lock out",
        cue_high: "Don't hyper-extend — keep slight elbow bend",
      },
      left_knee: {
        min: 168, max: 180,
        weight: 1.5,
        cue_low:  "Keep your left leg flat on the ground",
        cue_high: "Keep your left leg flat on the ground",
      },
      right_knee: {
        min: 168, max: 180,
        weight: 1.5,
        cue_low:  "Keep your right leg flat on the ground",
        cue_high: "Keep your right leg flat on the ground",
      },
      left_shoulder: {
        min: 30, max: 75,
        weight: 1.5,
        cue_low:  "Lift your chest higher — open the front body",
        cue_high: "Don't over-strain — reduce the backbend",
      },
      right_shoulder: {
        min: 30, max: 75,
        weight: 1.5,
        cue_low:  "Lift your chest higher — open the front body",
        cue_high: "Don't over-strain — reduce the backbend",
      },
    },
  },

  // ── Goddess Pose — Utkata Konasana ──────────────────────────────────────
  goddess: {
    description: "Goddess (Utkata Konasana)",
    emoji: "🌟",
    image: "/poses/goddess.jpg",
    holdTarget: 20,
    joints: {
      left_knee: {
        min: 85, max: 110,
        weight: 2.5,
        cue_low:  "Bend your left knee more (target ~90°)",
        cue_high: "Don't let the knee go past the foot",
      },
      right_knee: {
        min: 85, max: 110,
        weight: 2.5,
        cue_low:  "Bend your right knee more (target ~90°)",
        cue_high: "Don't let the knee go past the foot",
      },
      left_elbow: {
        min: 85, max: 105,
        weight: 1.5,
        cue_low:  "Raise left arm — bend elbow to 90° (cactus arms)",
        cue_high: "Bend left elbow more — cactus arms",
      },
      right_elbow: {
        min: 85, max: 105,
        weight: 1.5,
        cue_low:  "Raise right arm — bend elbow to 90° (cactus arms)",
        cue_high: "Bend right elbow more — cactus arms",
      },
      left_shoulder: {
        min: 80, max: 100,
        weight: 1.2,
        cue_low:  "Raise left arm to shoulder height",
        cue_high: "Lower left arm to shoulder height",
      },
      right_shoulder: {
        min: 80, max: 100,
        weight: 1.2,
        cue_low:  "Raise right arm to shoulder height",
        cue_high: "Lower right arm to shoulder height",
      },
    },
  },

  // ── Triangle Pose — Trikonasana ──────────────────────────────────────────
  triangle: {
    description: "Triangle (Trikonasana)",
    emoji: "△",
    image: "/poses/triangle.jpg",
    holdTarget: 25,
    joints: {
      left_knee: {
        min: 168, max: 180,
        weight: 2.5,
        cue_low:  "Straighten your front (left) leg fully",
        cue_high: "Straighten your front (left) leg fully",
      },
      right_knee: {
        min: 168, max: 180,
        weight: 2.5,
        cue_low:  "Straighten your back (right) leg fully",
        cue_high: "Straighten your back (right) leg fully",
      },
      left_hip: {
        min: 78, max: 105,
        weight: 2.0,
        cue_low:  "Lean your torso sideways more — reach the floor",
        cue_high: "Don't lean too far — keep hips squared",
      },
      left_elbow: {
        min: 162, max: 180,
        weight: 1.5,
        cue_low:  "Extend left arm fully",
        cue_high: "Extend left arm fully",
      },
      right_elbow: {
        min: 162, max: 180,
        weight: 1.5,
        cue_low:  "Reach your right arm straight up",
        cue_high: "Reach your right arm straight up",
      },
    },
  },
  // ── Mountain Pose — Tadasana ──────────────────────────────────────────
  tadasana: {
    description: "Mountain Pose (Tadasana)",
    emoji: "🏔️",
    image: "/poses/tadasana.jpg",
    holdTarget: 20,
    joints: {
      left_knee: {
        min: 168, max: 180,
        weight: 2.0,
        cue_low: "Keep both legs straight and firm",
        cue_high: "Maintain tall upright stance",
      },
      right_knee: {
        min: 168, max: 180,
        weight: 2.0,
        cue_low: "Keep both legs straight and firm",
        cue_high: "Maintain tall upright stance",
      },
      left_hip: {
        min: 168, max: 180,
        weight: 2.0,
        cue_low: "Stand tall without tilting pelvis forward",
        cue_high: "Align hips over ankles",
      },
      right_hip: {
        min: 168, max: 180,
        weight: 2.0,
        cue_low: "Stand tall without tilting pelvis forward",
        cue_high: "Align hips over ankles",
      },
      left_elbow: {
        min: 160, max: 180,
        weight: 1.2,
        cue_low: "Extend arms straight along your sides or overhead",
        cue_high: "Extend arms straight",
      },
      right_elbow: {
        min: 160, max: 180,
        weight: 1.2,
        cue_low: "Extend arms straight along your sides or overhead",
        cue_high: "Extend arms straight",
      },
    },
  },

  // ── Child's Pose — Balasana ─────────────────────────────────────────────
  balasana: {
    description: "Child's Pose (Balasana)",
    emoji: "🧘",
    image: "/poses/balasana.jpg",
    holdTarget: 25,
    joints: {
      left_knee: {
        min: 25, max: 65,
        weight: 2.5,
        cue_low: "Fold knees comfortably and sit back on heels",
        cue_high: "Rest hips back toward heels",
      },
      right_knee: {
        min: 25, max: 65,
        weight: 2.5,
        cue_low: "Fold knees comfortably and sit back on heels",
        cue_high: "Rest hips back toward heels",
      },
      left_hip: {
        min: 30, max: 70,
        weight: 2.5,
        cue_low: "Fold torso forward over your thighs",
        cue_high: "Relax chest down toward the floor",
      },
      right_hip: {
        min: 30, max: 70,
        weight: 2.5,
        cue_low: "Fold torso forward over your thighs",
        cue_high: "Relax chest down toward the floor",
      },
    },
  },

  // ── Anulom Vilom Pranayama (Alternate Nostril Breathing) ───────────────
  anulom_vilom: {
    description: "Anulom Vilom Pranayama",
    emoji: "🌬️",
    image: "/poses/anulom_vilom.jpg",
    holdTarget: 30,
    joints: {
      left_hip: {
        min: 65, max: 115,
        weight: 2.0,
        cue_low: "Sit upright with spine straight",
        cue_high: "Keep torso steady and vertical",
      },
      right_hip: {
        min: 65, max: 115,
        weight: 2.0,
        cue_low: "Sit upright with spine straight",
        cue_high: "Keep torso steady and vertical",
      },
      right_elbow: {
        min: 40, max: 95,
        weight: 2.5,
        cue_low: "Raise right hand to bridge of nose / Vishnu Mudra",
        cue_high: "Keep right hand near nostrils for smooth alternate breathing",
      },
      left_elbow: {
        min: 130, max: 180,
        weight: 1.2,
        cue_low: "Rest left hand gently on knee (Jnana Mudra)",
        cue_high: "Rest left hand on knee",
      },
    },
  },

  // ── Vajrasana (Thunderbolt Pose) ────────────────────────────────────────
  vajrasana: {
    description: "Vajrasana (Thunderbolt Pose)",
    emoji: "⚡",
    image: "/poses/vajrasana.jpg",
    holdTarget: 25,
    joints: {
      left_knee: {
        min: 25, max: 65,
        weight: 2.5,
        cue_low: "Kneel and sit squarely on heels",
        cue_high: "Keep knees together and sit back",
      },
      right_knee: {
        min: 25, max: 65,
        weight: 2.5,
        cue_low: "Kneel and sit squarely on heels",
        cue_high: "Keep knees together and sit back",
      },
      left_hip: {
        min: 75, max: 105,
        weight: 2.0,
        cue_low: "Keep spine upright, avoid slouching",
        cue_high: "Keep spine straight and shoulders relaxed",
      },
      right_hip: {
        min: 75, max: 105,
        weight: 2.0,
        cue_low: "Keep spine upright, avoid slouching",
        cue_high: "Keep spine straight and shoulders relaxed",
      },
    },
  },
};

// Ordered list for the carousel / selector
export const POSE_LIST = Object.keys(POSE_DEFINITIONS);

/**
 * Normalizes any pose name string (including Sanskrit and English names)
 * into a valid key present in POSE_DEFINITIONS.
 */
export function mapPoseNameToKey(poseName = "") {
  if (!poseName || typeof poseName !== "string") return "tree_pose";
  const norm = poseName.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Specific pose checks
  if (norm.includes("anulom") || norm.includes("vilom") || norm.includes("nadishodh") || norm.includes("pranayam") || norm.includes("breath")) return "anulom_vilom";
  if (norm.includes("vajrasana") || norm.includes("vajrasan")) return "vajrasana";
  if (norm.includes("mountain") || norm.includes("tadasana") || norm.includes("tadasan")) return "tadasana";
  if (norm.includes("tree") || norm.includes("vrks") || norm.includes("vriksh") || norm.includes("vriksha")) return "tree_pose";
  if (norm.includes("child") || norm.includes("balasana") || norm.includes("balasan") || norm.includes("shavasana") || norm.includes("corpse")) return "balasana";
  if (norm.includes("cobra") || norm.includes("bhujang")) return "cobra";
  if (norm.includes("warrior") || norm.includes("virabhadr") || norm.includes("veerabhadr")) return "warrior_2";
  if (norm.includes("triangle") || norm.includes("trikon")) return "triangle";
  if (norm.includes("dog") || norm.includes("adho") || norm.includes("downward") || norm.includes("svan")) return "downward_dog";
  if (norm.includes("plank") || norm.includes("phalak") || norm.includes("phalakasana") || norm.includes("dandasana")) return "plank";
  if (norm.includes("goddess") || norm.includes("utkat") || norm.includes("utkata")) return "goddess";
  if (norm.includes("cat") || norm.includes("cow") || norm.includes("marjary") || norm.includes("bitil")) return "cobra";
  if (norm.includes("walk")) return "tadasana";

  // Check exact key matches
  if (POSE_DEFINITIONS[poseName]) return poseName;
  return "tree_pose";
}
