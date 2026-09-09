import { useEffect, useRef, useState } from "react";
import { Activity, AlertTriangle, Check, CheckCircle2 } from "lucide-react";
import {
  LANDMARK_MAP,
  SKELETON_CONNECTIONS,
  normalizeLandmarks,
  computeJointAngles,
  smoothAngle,
  resetEMA,
  evaluatePose,
  detectPose,
  debounceJoint,
  resetDebounce,
} from "../../services/pose/geometry.js";
import {
  POSE_DEFINITIONS,
  POSE_LIST,
  mapPoseNameToKey,
} from "../../services/pose/pose_definitions.js";

const COLORS = {
  correct: "#10b981",    // vibrant emerald
  incorrect: "#ef4444",  // vibrant red
  pointer: "#06b6d4",    // vibrant cyan for tracking body pointers
  bone: "rgba(6, 182, 212, 0.70)",      // cyan skeleton bones
  boneOk: "rgba(16, 185, 129, 0.85)",   // green bones
  boneBad: "rgba(239, 68, 68, 0.85)",   // red bones
};

// Key body points to render with high-visibility pulsating pointers
const BODY_POINTERS = [
  { key: "nose", label: "Head", r: 7 },
  { key: "left_shoulder", label: "L Shoulder", r: 10 },
  { key: "right_shoulder", label: "R Shoulder", r: 10 },
  { key: "left_elbow", label: "L Elbow", r: 9 },
  { key: "right_elbow", label: "R Elbow", r: 9 },
  { key: "left_wrist", label: "L Wrist", r: 8 },
  { key: "right_wrist", label: "R Wrist", r: 8 },
  { key: "left_hip", label: "L Hip", r: 10 },
  { key: "right_hip", label: "R Hip", r: 10 },
  { key: "left_knee", label: "L Knee", r: 10 },
  { key: "right_knee", label: "R Knee", r: 10 },
  { key: "left_ankle", label: "L Ankle", r: 8 },
  { key: "right_ankle", label: "R Ankle", r: 8 },
  { key: "left_foot_index", label: "L Foot", r: 6 },
  { key: "right_foot_index", label: "R Foot", r: 6 },
];

export default function YogaPoseCheckerModal({
  initialPoseKey = "",
  initialPoseName = "",
  onClose,
  onCompletePose,
}) {
  const resolvedInitialKey = (() => {
    if (initialPoseKey && POSE_DEFINITIONS[initialPoseKey]) return initialPoseKey;
    if (initialPoseName) return mapPoseNameToKey(initialPoseName);
    return "tree_pose";
  })();

  const [currentPoseKey, setCurrentPoseKey] = useState(resolvedInitialKey);

  // When user clicks 'Check Pose' for a specific exercise, update state to that exact pose
  useEffect(() => {
    if (initialPoseKey && POSE_DEFINITIONS[initialPoseKey]) {
      setCurrentPoseKey(initialPoseKey);
    } else if (initialPoseName) {
      setCurrentPoseKey(mapPoseNameToKey(initialPoseName));
    }
  }, [initialPoseKey, initialPoseName]);

  const [autoDetect, setAutoDetect] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [showPointers, setShowPointers] = useState(true);
  const [showJointMatrix, setShowJointMatrix] = useState(false);
  const [score, setScore] = useState(0);
  const [isCorrect, setIsCorrect] = useState(false);
  const [feedbackCues, setFeedbackCues] = useState([]);
  const [activeCue, setActiveCue] = useState("Position yourself in camera view to begin");
  const [evaluatedJoints, setEvaluatedJoints] = useState({});
  const [holdProgress, setHoldProgress] = useState(0);
  const [holdSecs, setHoldSecs] = useState(0);
  const [cameraLoading, setCameraLoading] = useState(true);
  const [cameraError, setCameraError] = useState("");
  const [fps, setFps] = useState(0);
  const [trackedLandmarksCount, setTrackedLandmarksCount] = useState(0);
  const [completedSuccess, setCompletedSuccess] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const poseInstanceRef = useRef(null);
  const cameraInstanceRef = useRef(null);
  const animFrameRef = useRef(null);
  const lastVoiceCueRef = useRef("");
  const holdStartRef = useRef(null);
  const lastFrameTimeRef = useRef(performance.now());
  const frameTimesRef = useRef([]);

  const currentPoseDef = POSE_DEFINITIONS[currentPoseKey] || POSE_DEFINITIONS.cobra;
  const targetHoldSecs = currentPoseDef.holdTarget || 20;

  // Voice coach speaker
  const speakCue = (text) => {
    if (!("speechSynthesis" in window) || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    u.pitch = 1.0;
    window.speechSynthesis.speak(u);
  };

  // Switch pose
  const handleSelectPose = (key) => {
    setCurrentPoseKey(key);
    setAutoDetect(false);
    resetEMA();
    resetDebounce();
    holdStartRef.current = null;
    setHoldProgress(0);
    setHoldSecs(0);
    setFeedbackCues([]);
    setActiveCue("");
    setCompletedSuccess(false);
  };

  // Draw Body Pointers & Skeleton onto Canvas
  const drawSkeletonAndPointers = (rawLandmarks, jointResults, canvas) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    if (!rawLandmarks || rawLandmarks.length === 0) return;

    // Helper: Map landmark coordinates to mirrored screen space (since webcam video has scaleX(-1))
    // By mirroring x via (1 - lm.x), canvas DOES NOT need CSS scaleX(-1).
    // This keeps all text labels, degree numbers, and badges upright and readable!
    const px = (lm) => ({ x: (1 - lm.x) * W, y: lm.y * H });

    // ── 1. Draw Skeleton Bones ────────────────────────────────────────────────
    ctx.lineWidth = 4.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const [nameA, nameB] of SKELETON_CONNECTIONS) {
      const idxA = LANDMARK_MAP[nameA];
      const idxB = LANDMARK_MAP[nameB];
      if (idxA === undefined || idxB === undefined) continue;
      const lmA = rawLandmarks[idxA];
      const lmB = rawLandmarks[idxB];
      if (!lmA || !lmB) continue;
      if ((lmA.visibility ?? 0) < 0.20 || (lmB.visibility ?? 0) < 0.20) continue;

      const pA = px(lmA);
      const pB = px(lmB);

      // Color bone by connected joint status
      const jA = jointResults?.[nameA];
      const jB = jointResults?.[nameB];
      let strokeColor = COLORS.bone;

      if ((jA?.status === "correct" || jB?.status === "correct") && !(jA?.status === "incorrect" || jB?.status === "incorrect")) {
        strokeColor = COLORS.boneOk;
      } else if (jA?.status === "incorrect" || jB?.status === "incorrect") {
        strokeColor = COLORS.boneBad;
      }

      ctx.strokeStyle = strokeColor;
      ctx.shadowColor = strokeColor;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(pA.x, pA.y);
      ctx.lineTo(pB.x, pB.y);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // ── 2. Draw Body Pointers (Joint Landmarks) ──────────────────────────────
    if (showPointers) {
      for (const ptr of BODY_POINTERS) {
        const idx = LANDMARK_MAP[ptr.key];
        if (idx === undefined) continue;
        const lm = rawLandmarks[idx];
        if (!lm || (lm.visibility ?? 0) < 0.20) continue;

        const p = px(lm);
        const jResult = jointResults?.[ptr.key];

        let ringColor = COLORS.pointer;
        let radius = ptr.r;

        if (jResult) {
          if (jResult.status === "correct") {
            ringColor = COLORS.correct;
            radius = ptr.r + 2;
          } else if (jResult.status === "incorrect") {
            ringColor = COLORS.incorrect;
            radius = ptr.r + 2;
          }
        }

        // Outer Pulsing Glow Halo
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius + 6, 0, 2 * Math.PI);
        ctx.fillStyle = ringColor === COLORS.correct ? "rgba(16, 185, 129, 0.35)"
                      : ringColor === COLORS.incorrect ? "rgba(239, 68, 68, 0.35)"
                      : "rgba(6, 182, 212, 0.35)";
        ctx.fill();

        // Main Color Disc
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, 2 * Math.PI);
        ctx.fillStyle = ringColor;
        ctx.shadowColor = ringColor;
        ctx.shadowBlur = 14;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Inner White Dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(radius - 5, 3.5), 0, 2 * Math.PI);
        ctx.fillStyle = "#ffffff";
        ctx.fill();

        // Joint Angle Degree Label Badge
        if (jResult?.angle !== null && jResult?.angle !== undefined) {
          const text = `${Math.round(jResult.angle)}°`;
          ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

          // Text shadow pill background
          const textWidth = ctx.measureText(text).width;
          const badgeX = p.x + 12;
          const badgeY = p.y - 18;

          ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY, textWidth + 10, 20, 5);
          ctx.fill();

          ctx.strokeStyle = ringColor;
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.fillStyle = ringColor === COLORS.correct ? "#a7f3d0"
                        : ringColor === COLORS.incorrect ? "#fecaca"
                        : "#e0f2fe";
          ctx.fillText(text, badgeX + 5, badgeY + 14);
        }
      }
    }
  };

  // Process MediaPipe results
  const onResults = (results) => {
    try {
      setCameraLoading(false);

      // Track FPS
      const now = performance.now();
      const delta = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;
      frameTimesRef.current.push(delta);
      if (frameTimesRef.current.length > 25) frameTimesRef.current.shift();
      const avgMs = frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length;
      setFps(Math.round(1000 / avgMs));

      if (!canvasRef.current || !videoRef.current) return;
      const canvas = canvasRef.current;
      const video = videoRef.current;

      // Sync canvas buffer size to match video feed resolution
      if (video.videoWidth > 0 && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      const rawLandmarks = results?.poseLandmarks;
      if (!rawLandmarks || rawLandmarks.length === 0) {
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setTrackedLandmarksCount(0);
        setActiveCue("Position yourself in front of the camera so body pointers appear");
        setScore(0);
        setIsCorrect(false);
        return;
      }

      // Count visible landmarks
      const visibleCount = rawLandmarks.filter((lm) => (lm.visibility ?? 0) > 0.25).length;
      setTrackedLandmarksCount(visibleCount);

      // 1. Normalize landmarks
      const norm = normalizeLandmarks(rawLandmarks);
      if (!norm) {
        drawSkeletonAndPointers(rawLandmarks, {}, canvas);
        return;
      }

      // 2. Compute joint angles
      const rawAngles = computeJointAngles(norm);

      // 3. Smooth angles via EMA
      const smoothedAngles = {};
      for (const [joint, data] of Object.entries(rawAngles)) {
        if (data && data.visible && data.angle !== null) {
          smoothedAngles[joint] = {
            angle: smoothAngle(joint, data.angle),
            visible: true,
          };
        } else {
          smoothedAngles[joint] = data || { angle: null, visible: false };
        }
      }

      // 4. Auto-detect or current pose
      let activeKey = currentPoseKey;
      if (autoDetect) {
        const detected = detectPose(smoothedAngles);
        if (detected.bestPose && detected.bestPose !== "unknown") {
          activeKey = detected.bestPose;
          setCurrentPoseKey(activeKey);
        }
      }

      // 5. Evaluate pose against reference definition
      const poseDef = POSE_DEFINITIONS[activeKey] || POSE_DEFINITIONS.cobra;
      const evalResult = evaluatePose(poseDef, smoothedAngles);

      // Debounce joint status to eliminate flickers
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
      setEvaluatedJoints(debouncedJoints);

      // 6. Draw glowing skeleton & high-visibility body pointers
      drawSkeletonAndPointers(rawLandmarks, evalResult.joints, canvas);

      // 7. Update HUD metrics
      const currentScore = evalResult.score ?? 0;
      setScore(currentScore);
      const formOk = evalResult.correct;
      setIsCorrect(formOk);

      // Hold Timer logic
      if (formOk) {
        if (!holdStartRef.current) holdStartRef.current = Date.now();
        const elapsed = (Date.now() - holdStartRef.current) / 1000;
        setHoldSecs(Math.floor(elapsed));
        const pct = Math.min((elapsed / targetHoldSecs) * 100, 100);
        setHoldProgress(pct);

        if (elapsed >= targetHoldSecs && !completedSuccess) {
          setCompletedSuccess(true);
          if (voiceEnabled) speakCue("Target hold complete! Excellent form!");
        }
      } else {
        holdStartRef.current = null;
        setHoldProgress(0);
        setHoldSecs(0);
      }

      // Feedback cues
      if (evalResult.feedback && evalResult.feedback.length > 0) {
        setFeedbackCues(evalResult.feedback.slice(0, 3));
        const topCue = evalResult.feedback[0]?.cue || "";
        setActiveCue(topCue);

        if (voiceEnabled && topCue && topCue !== lastVoiceCueRef.current) {
          speakCue(topCue);
          lastVoiceCueRef.current = topCue;
        }
      } else {
        setFeedbackCues([]);
        setActiveCue(formOk ? "🌟 Perfect posture alignment! Hold steady and breathe." : "Align into position");
      }
    } catch (err) {
      console.error("Frame evaluation error in onResults:", err);
    }
  };

  // Setup Camera and MediaPipe Pose
  useEffect(() => {
    let active = true;
    let localStream = null;

    async function initCameraAndPose() {
      setCameraLoading(true);
      setCameraError("");

      // 1. Wait for MediaPipe Pose library from window
      let waited = 0;
      while (!window.Pose && waited < 40) {
        await new Promise((r) => setTimeout(r, 100));
        waited++;
      }

      if (!window.Pose) {
        setCameraError("MediaPipe Pose library could not be loaded from CDN. Please check your internet connection.");
        setCameraLoading(false);
        return;
      }

      try {
        // 2. Initialize MediaPipe Pose
        const pose = new window.Pose({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/${file}`,
        });

        pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          minDetectionConfidence: 0.35,
          minTrackingConfidence: 0.35,
        });

        pose.onResults(onResults);
        poseInstanceRef.current = pose;

        // 3. Start Webcam using native getUserMedia
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: "user",
          },
          audio: false,
        });

        localStream = stream;

        if (videoRef.current && active) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraLoading(false);

          // Try window.Camera first if available for hardware frame sync
          if (window.Camera) {
            try {
              const cam = new window.Camera(videoRef.current, {
                onFrame: async () => {
                  if (active && poseInstanceRef.current && videoRef.current) {
                    await poseInstanceRef.current.send({ image: videoRef.current });
                  }
                },
                width: 640,
                height: 480,
              });
              await cam.start();
              cameraInstanceRef.current = cam;
              return;
            } catch (camErr) {
              console.warn("window.Camera start failed, falling back to pumpFrame:", camErr);
            }
          }

          // Fallback continuous pump loop
          let isSending = false;
          const pumpFrame = async () => {
            if (!active) return;
            if (videoRef.current && videoRef.current.readyState >= 2 && poseInstanceRef.current) {
              if (!isSending) {
                isSending = true;
                try {
                  await poseInstanceRef.current.send({ image: videoRef.current });
                } catch (sendErr) {
                  console.warn("Pose frame send warning:", sendErr);
                } finally {
                  isSending = false;
                }
              }
            }
            animFrameRef.current = requestAnimationFrame(pumpFrame);
          };

          animFrameRef.current = requestAnimationFrame(pumpFrame);
        }
      } catch (err) {
        if (active) {
          console.error("Camera init error:", err);
          setCameraError(err.message || "Webcam access denied. Please allow camera permissions in browser.");
          setCameraLoading(false);
        }
      }
    }

    initCameraAndPose();

    return () => {
      active = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (cameraInstanceRef.current?.stop) {
        try { cameraInstanceRef.current.stop(); } catch {}
      }
      if (poseInstanceRef.current?.close) {
        try { poseInstanceRef.current.close(); } catch {}
      }
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleMarkAsDone = () => {
    if (onCompletePose) {
      onCompletePose(currentPoseDef.description || currentPoseDef.name || currentPoseKey);
    }
    onClose();
  };

  return (
    <div className="yoga-modal-backdrop">
      <div className="yoga-modal-card">
        {/* Modal Header */}
        <div className="yoga-modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(16, 185, 129, 0.15)", color: "#059669", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Activity size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: "1.25rem", margin: 0, fontWeight: "700", color: "#0f172a" }}>
                AI Pose Correction — {currentPoseDef.description}
              </h2>
              <p className="muted" style={{ fontSize: "0.8rem", margin: "2px 0 0 0" }}>
                Computer Vision Body Pointer & Angle Analyzer
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* FPS Badge */}
            <span className="badge" style={{ background: fps >= 15 ? "#dcfce7" : "#fef9c3", color: fps >= 15 ? "#15803d" : "#854d0e", fontSize: "0.78rem", fontWeight: "600" }}>
              {fps} FPS
            </span>

            {/* Joints Tracked Badge */}
            <span className="badge" style={{ background: trackedLandmarksCount >= 12 ? "#e0f2fe" : "#f1f5f9", color: trackedLandmarksCount >= 12 ? "#0369a1" : "#64748b", fontSize: "0.78rem" }}>
              📍 {trackedLandmarksCount} Points Tracked
            </span>

            {/* Body Pointers Toggle Button */}
            <button
              type="button"
              className={`btn ${showPointers ? "" : "ghost"}`}
              style={{
                fontSize: "0.78rem",
                padding: "5px 10px",
                background: showPointers ? "#06b6d4" : undefined,
                color: showPointers ? "white" : undefined,
                border: "1px solid #06b6d4",
              }}
              onClick={() => setShowPointers((v) => !v)}
              title="Toggle glowing joint body pointers on video"
            >
              📍 Pointers: {showPointers ? "ON" : "OFF"}
            </button>

            {/* Voice Coach Toggle */}
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.82rem", cursor: "pointer", marginLeft: 4 }}>
              <span>🔊 Voice</span>
              <input
                type="checkbox"
                checked={voiceEnabled}
                onChange={(e) => {
                  setVoiceEnabled(e.target.checked);
                  if (e.target.checked) speakCue("Voice coaching enabled");
                }}
              />
            </label>

            <button
              type="button"
              className="btn ghost"
              style={{ padding: "6px 12px", marginLeft: 6 }}
              onClick={onClose}
            >
              ✕ Close
            </button>
          </div>
        </div>

        {/* Pose Selector Bar */}
        <div className="yoga-pose-selector-bar">
          {POSE_LIST.map((key) => {
            const def = POSE_DEFINITIONS[key];
            const active = currentPoseKey === key && !autoDetect;
            const shortName = key === "anulom_vilom" 
              ? "Anulom Vilom" 
              : key === "warrior_2" 
              ? "Warrior II" 
              : key === "downward_dog" 
              ? "Downward Dog"
              : def.description.split(" (")[0];
            return (
              <button
                key={key}
                type="button"
                className={`pose-pill-btn ${active ? "active" : ""}`}
                onClick={() => handleSelectPose(key)}
              >
                <span>{shortName}</span>
              </button>
            );
          })}

          <button
            type="button"
            className={`pose-pill-btn ${autoDetect ? "active" : ""}`}
            style={{ background: autoDetect ? "#4f46e5" : undefined, color: autoDetect ? "white" : undefined }}
            onClick={() => {
              setAutoDetect((v) => !v);
              resetEMA();
              resetDebounce();
            }}
          >
            <span>🤖 Auto-Detect</span>
          </button>
        </div>

        {/* Main Stage: Camera + Skeleton Overlay + Live HUD */}
        <div className="yoga-modal-body">
          <div className="camera-viewport-container">
            {cameraLoading && (
              <div className="camera-loading-box">
                <div className="spinner" style={{ margin: "0 auto 12px auto" }} />
                <p style={{ margin: 0, fontWeight: "600" }}>Connecting Camera & AI Pose Model…</p>
                <p className="muted" style={{ fontSize: "0.82rem", margin: "4px 0 0 0" }}>
                  Initializing body pointers & joint angle tracking…
                </p>
              </div>
            )}

            {cameraError && (
              <div className="camera-error-box">
                <p style={{ fontWeight: "700", color: "#ef4444", display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
                  <AlertTriangle size={16} />
                  Camera Access Error
                </p>
                <p style={{ fontSize: "0.85rem", margin: "4px 0 0 0" }}>{cameraError}</p>
                <p className="muted" style={{ fontSize: "0.8rem", marginTop: 8 }}>
                  Ensure your webcam is connected and allowed in browser site settings.
                </p>
              </div>
            )}

            <div className="video-canvas-stack">
              {/* Mirrored webcam video */}
              <video ref={videoRef} playsInline muted autoPlay className="webcam-video" />

              {/* Skeleton and body pointers canvas (drawn with (1 - lm.x) to match video mirror, without CSS scaleX) */}
              <canvas ref={canvasRef} className="skeleton-canvas" />

              {/* Demo Exercise Photograph PiP Thumbnail */}
              <div className="video-demo-pip" title="Reference Exercise Photograph">
                <img
                  src={currentPoseDef.image || `/poses/${currentPoseKey}.jpg`}
                  alt={currentPoseDef.description}
                  className="demo-pip-img"
                  onError={(e) => { e.target.style.display = "none"; }}
                />
                <div className="demo-pip-label">
                  <span>Demo Form</span>
                </div>
              </div>

              {/* Status Pill on Video */}
              <div className={`video-status-badge ${isCorrect ? "status-good" : "status-adjust"}`} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                {isCorrect ? <CheckCircle2 size={13} /> : <Activity size={13} />}
                <span>{isCorrect ? "GOOD FORM" : "ADJUST FORM"}</span>
              </div>

              {/* Live Guidance Cue Bar at bottom of camera */}
              <div className="video-bottom-cue-banner">
                <span>{activeCue}</span>
              </div>
            </div>
          </div>

          {/* Right-Hand Real-Time HUD Panel */}
          <div className="yoga-hud-panel">
            {/* Demo Reference Photograph Card */}
            <div className="hud-metric-card" style={{ padding: "10px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: "0.78rem", fontWeight: "700", color: "#1e293b", display: "flex", alignItems: "center", gap: 5 }}>
                  📷 Reference Demo Pose
                </span>
                <span className="badge" style={{ fontSize: "0.68rem", background: "#e0f2fe", color: "#0369a1", padding: "2px 8px" }}>
                  Target Form
                </span>
              </div>
              <div style={{ position: "relative", width: "100%", height: 135, borderRadius: 8, overflow: "hidden", background: "#0f172a" }}>
                <img
                  src={currentPoseDef.image || `/poses/${currentPoseKey}.jpg`}
                  alt={currentPoseDef.description}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={(e) => { e.target.style.display = "none"; }}
                />
                <div style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: "linear-gradient(transparent, rgba(15, 23, 42, 0.88))",
                  color: "white",
                  padding: "6px 10px 4px 10px",
                  fontSize: "0.72rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}>
                  <span style={{ fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {currentPoseDef.description}
                  </span>
                  <span style={{ fontSize: "0.68rem", opacity: 0.9 }}>
                    ⏱ {currentPoseDef.holdTarget || 30}s
                  </span>
                </div>
              </div>
            </div>

            {/* Accuracy Score Card */}
            <div className="hud-metric-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span className="muted" style={{ fontSize: "0.78rem", fontWeight: "600", textTransform: "uppercase" }}>
                    Pose Accuracy Score
                  </span>
                  <div style={{ fontSize: "2rem", fontWeight: "800", color: score >= 70 ? "#10b981" : score >= 45 ? "#f59e0b" : "#ef4444" }}>
                    {score}%
                  </div>
                </div>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: "800",
                    fontSize: "1.2rem",
                    background: score >= 70 ? "rgba(16, 185, 129, 0.15)" : score >= 45 ? "rgba(245, 158, 11, 0.15)" : "rgba(239, 68, 68, 0.15)",
                    color: score >= 70 ? "#10b981" : score >= 45 ? "#f59e0b" : "#ef4444",
                    border: `2px solid ${score >= 70 ? "#10b981" : score >= 45 ? "#f59e0b" : "#ef4444"}`,
                  }}
                >
                  {score >= 70 ? "A+" : score >= 45 ? "B" : "C"}
                </div>
              </div>

              {/* Hold Progress Bar */}
              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: 4 }}>
                  <span>Pose Hold Duration</span>
                  <strong>{holdSecs}s / {targetHoldSecs}s</strong>
                </div>
                <div style={{ height: 8, background: "rgba(0,0,0,0.08)", borderRadius: 4, overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${holdProgress}%`,
                      height: "100%",
                      background: holdProgress >= 100 ? "#10b981" : "#047857",
                      transition: "width 0.2s linear",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Target Cues / Real-Time Corrections */}
            <div className="hud-metric-card" style={{ flex: 1, overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <strong style={{ fontSize: "0.9rem" }}>
                  🎯 Real-Time Form Suggestions:
                </strong>
                <button
                  type="button"
                  style={{
                    fontSize: "0.72rem",
                    background: "none",
                    border: "none",
                    color: "#0284c7",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                  onClick={() => setShowJointMatrix((v) => !v)}
                >
                  {showJointMatrix ? "Hide Angles" : "Show All Angles"}
                </button>
              </div>

              {feedbackCues.length === 0 ? (
                <div style={{ padding: "10px 0", color: isCorrect ? "#065f46" : "#64748b", fontSize: "0.85rem" }}>
                  {isCorrect
                    ? "✨ All joints aligned! Maintain this posture and breathe steadily."
                    : "Position yourself in camera view to detect full body pointers and angles."}
                </div>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.82rem", lineHeight: 1.5 }}>
                  {feedbackCues.map((cue, i) => (
                    <li key={i} style={{ marginBottom: 6, color: "#b91c1c" }}>
                      <strong style={{ textTransform: "capitalize" }}>{cue.joint.replace(/_/g, " ")}: </strong>
                      <span>{cue.cue}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Optional Detailed Angle Breakdown */}
              {showJointMatrix && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px dashed rgba(0,0,0,0.12)" }}>
                  <strong style={{ fontSize: "0.78rem", color: "#475569", display: "block", marginBottom: 6 }}>
                    Live Joint Angle Matrix
                  </strong>
                  <div style={{ maxHeight: 130, overflowY: "auto", fontSize: "0.75rem" }}>
                    {Object.entries(evaluatedJoints).map(([jointName, jInfo]) => (
                      <div
                        key={jointName}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "3px 0",
                          borderBottom: "1px solid rgba(0,0,0,0.04)",
                        }}
                      >
                        <span style={{ textTransform: "capitalize" }}>{jointName.replace(/_/g, " ")}</span>
                        <span style={{ fontWeight: "600", color: jInfo.correct ? "#10b981" : "#ef4444" }}>
                          {jInfo.angle !== null ? `${Math.round(jInfo.angle)}°` : "—"} (tgt: {jInfo.target?.[0]}°–{jInfo.target?.[1]}°)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Completion Success Callout */}
            {completedSuccess && (
              <div className="card" style={{ background: "#ecfdf5", border: "1px solid #10b981", padding: 12, textAlign: "center" }}>
                <strong style={{ color: "#065f46", fontSize: "0.95rem" }}>🎉 Hold Target Achieved!</strong>
                <p className="muted" style={{ fontSize: "0.8rem", margin: "4px 0 8px 0" }}>
                  Excellent form maintained for {targetHoldSecs} seconds.
                </p>
                <button
                  type="button"
                  className="btn"
                  style={{ width: "100%", background: "#10b981", padding: "8px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                  onClick={handleMarkAsDone}
                >
                  <Check size={16} />
                  <span>Mark Pose Done Today & Save</span>
                </button>
              </div>
            )}

            {/* Manual Action Button */}
            {!completedSuccess && (
              <button
                type="button"
                className="btn"
                style={{ width: "100%", padding: "10px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                onClick={handleMarkAsDone}
              >
                <Check size={16} />
                <span>Mark As Done Today</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .yoga-modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(15, 23, 42, 0.85);
          backdrop-filter: blur(6px);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .yoga-modal-card {
          background: #ffffff;
          border-radius: 16px;
          max-width: 1100px;
          width: 100%;
          max-height: 94vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          overflow: hidden;
        }
        .yoga-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 22px;
          border-bottom: 1px solid rgba(0,0,0,0.08);
          background: #f8fafc;
        }
        .yoga-pose-selector-bar {
          display: flex;
          gap: 8px;
          padding: 10px 20px;
          overflow-x: auto;
          background: #f1f5f9;
          border-bottom: 1px solid rgba(0,0,0,0.06);
        }
        .pose-pill-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 20px;
          border: 1px solid rgba(0,0,0,0.1);
          background: #ffffff;
          font-size: 0.82rem;
          font-weight: 500;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.2s ease;
        }
        .pose-pill-btn:hover {
          border-color: #047857;
        }
        .pose-pill-btn.active {
          background: #047857;
          color: white;
          border-color: #047857;
          font-weight: 700;
        }
        .yoga-modal-body {
          display: grid;
          grid-template-columns: 1fr 340px;
          gap: 16px;
          padding: 18px 20px;
          overflow-y: auto;
        }
        @media (max-width: 820px) {
          .yoga-modal-body {
            grid-template-columns: 1fr;
          }
        }
        .camera-viewport-container {
          position: relative;
          background: #0f172a;
          border-radius: 12px;
          overflow: hidden;
          min-height: 440px;
          aspect-ratio: 4/3;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .camera-loading-box, .camera-error-box {
          position: absolute;
          z-index: 10;
          color: white;
          text-align: center;
          padding: 24px;
        }
        .video-canvas-stack {
          position: relative;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .webcam-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transform: scaleX(-1); /* mirror video for natural user feedback */
          border-radius: 12px;
          display: block;
        }
        .skeleton-canvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          pointer-events: none;
          /* No scaleX(-1) here: (1 - x) coordinate math keeps all joint text and tags upright! */
        }
        .video-status-badge {
          position: absolute;
          top: 14px;
          left: 14px;
          z-index: 5;
          padding: 5px 12px;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.5px;
        }
        .video-demo-pip {
          position: absolute;
          top: 14px;
          right: 14px;
          z-index: 6;
          width: 120px;
          height: 84px;
          border-radius: 8px;
          overflow: hidden;
          border: 2px solid rgba(255, 255, 255, 0.85);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
          background: #0f172a;
          transition: transform 0.2s ease;
        }
        .video-demo-pip:hover {
          transform: scale(1.05);
        }
        .demo-pip-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .demo-pip-label {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: rgba(15, 23, 42, 0.85);
          color: #ffffff;
          font-size: 0.62rem;
          font-weight: 700;
          text-align: center;
          padding: 2px 0;
          letter-spacing: 0.4px;
          text-transform: uppercase;
        }
        .status-good {
          background: #10b981;
          color: white;
          box-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
        }
        .status-adjust {
          background: #f59e0b;
          color: white;
          box-shadow: 0 0 10px rgba(245, 158, 11, 0.5);
        }
        .video-bottom-cue-banner {
          position: absolute;
          bottom: 12px;
          left: 14px;
          right: 14px;
          z-index: 5;
          background: rgba(15, 23, 42, 0.88);
          color: #ffffff;
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 0.85rem;
          font-weight: 600;
          text-align: center;
          backdrop-filter: blur(6px);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .yoga-hud-panel {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .hud-metric-card {
          background: #f8fafc;
          border: 1px solid rgba(0,0,0,0.07);
          border-radius: 10px;
          padding: 14px;
        }
      `}</style>
    </div>
  );
}
