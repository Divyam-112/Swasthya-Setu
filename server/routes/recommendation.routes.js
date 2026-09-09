import { Router } from "express";
import { verifyToken, restrictTo } from "../middleware/auth.js";
import { getRecommendations } from "../controllers/recommendationController.js";

const router = Router();

router.use(verifyToken, restrictTo("patient"));
router.get("/", getRecommendations);

export default router;
