import { Router, type IRouter } from "express";
import healthRouter from "./health";
import triviaRouter from "./trivia";

const router: IRouter = Router();

router.use(healthRouter);
router.use(triviaRouter);

export default router;
