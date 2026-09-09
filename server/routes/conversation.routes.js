import { Router } from "express";
import { verifyToken, restrictTo } from "../middleware/auth.js";
import {
  respondToQuestion,
  respondVoice,
  getConversation,
} from "../controllers/conversationController.js";
import {
  getSupportedLanguages,
  getSpeechConfig,
} from "../services/speechService.js";

const router = Router();

// Speech config must stay above "/:sessionId".
router.get("/speech/languages", (req, res) => {
  res.json({
    success: true,
    data: getSupportedLanguages(),
    message: "Supported languages for speech recognition",
  });
});

router.get("/speech/config/:langCode", (req, res) => {
  const { langCode } = req.params;
  const config = getSpeechConfig(langCode);
  res.json({
    success: true,
    data: config,
    message: `Speech config for ${config.languageInfo.name}`,
  });
});

router.post("/respond", verifyToken, restrictTo("patient"), respondToQuestion);
router.post("/voice", verifyToken, restrictTo("patient"), respondVoice);
router.get("/:sessionId", verifyToken, getConversation);

export default router;
