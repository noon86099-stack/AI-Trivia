import { Router, type IRouter, type Request, type Response } from "express";
import {
  SubmitTriviaAnswerBody, SubmitTriviaAnswerResponse, ExplainTriviaAnswerBody,
  ExplainTriviaAnswerResponse, GetTriviaQuestionResponse,
} from "@workspace/api-zod";
import { checkAnswer, explainAnswer, loadQuestion, TriviaError } from "../lib/trivia";

const router: IRouter = Router();
const requestWindows = new Map<string, { count: number; until: number }>();
let hourlyAI = { count: 0, until: 0 };

function limit(req: Request, ai: boolean) {
  const now = Date.now();
  for (const [key, value] of requestWindows) if (value.until < now) requestWindows.delete(key);
  const id = `${ai ? "ai" : "quiz"}:${req.ip ?? "unknown"}`;
  const window = requestWindows.get(id) ?? { count: 0, until: now + 60000 };
  window.count++;
  requestWindows.set(id, window);
  if (window.count > (ai ? 6 : 30)) {
    throw new TriviaError(429, "RATE_LIMITED", "Please take a short break, then try again.", Math.max(1, Math.ceil((window.until - now) / 1000)));
  }
  if (ai) {
    if (hourlyAI.until < now) hourlyAI = { count: 0, until: now + 3600000 };
    hourlyAI.count++;
    if (hourlyAI.count > 120) {
      throw new TriviaError(429, "RATE_LIMITED", "AI explanations have reached this app's hourly limit. You can keep playing and try explanations later.", Math.ceil((hourlyAI.until - now) / 1000));
    }
  }
}

function fail(error: unknown, req: Request, res: Response) {
  if (error instanceof TriviaError) {
    req.log.warn({ code: error.code, status: error.status }, "Trivia request failed");
    if (error.retryAfter) res.setHeader("Retry-After", error.retryAfter);
    res.status(error.status).json({ error: error.message, code: error.code, ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}) });
  } else {
    req.log.error("Unexpected trivia request failure");
    res.status(500).json({ error: "Something went wrong. Please try again.", code: "SERVER_ERROR" });
  }
}

router.use("/trivia", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });

router.get("/trivia/question", async (req, res): Promise<void> => {
  try {
    limit(req, false);
    const categoryRaw = req.query.category;
    const difficultyRaw = req.query.difficulty;
    const category = categoryRaw === undefined ? undefined : Number(categoryRaw);
    if (
      (categoryRaw !== undefined && (typeof categoryRaw !== "string" || !Number.isInteger(category) || category! < 9 || category! > 32)) ||
      (difficultyRaw !== undefined && (typeof difficultyRaw !== "string" || !["easy", "medium", "hard"].includes(difficultyRaw)))
    ) {
      throw new TriviaError(400, "INVALID_FILTER", "Choose a valid question category and difficulty.");
    }
    res.json(GetTriviaQuestionResponse.parse(await loadQuestion({
      ...(category !== undefined ? { category } : {}),
      ...(typeof difficultyRaw === "string" ? { difficulty: difficultyRaw as "easy" | "medium" | "hard" } : {}),
    })));
  } catch (error) { fail(error, req, res); }
});

router.post("/trivia/answer", async (req, res): Promise<void> => {
  try {
    limit(req, false);
    const parsed = SubmitTriviaAnswerBody.safeParse(req.body);
    if (!parsed.success) throw new TriviaError(400, "INVALID_INPUT", "Please choose an answer to the current question.");
    res.json(SubmitTriviaAnswerResponse.parse(await checkAnswer(parsed.data.questionId, parsed.data.answerId)));
  } catch (error) { fail(error, req, res); }
});

router.post("/trivia/explanation", async (req, res): Promise<void> => {
  try {
    const parsed = ExplainTriviaAnswerBody.safeParse(req.body);
    if (!parsed.success) throw new TriviaError(400, "INVALID_INPUT", "Choose an answer first so the AI can explain it.");
    // Reject invalid question IDs before spending an AI request.
    await checkAnswer(parsed.data.questionId, parsed.data.answerId);
    limit(req, true);
    res.json(ExplainTriviaAnswerResponse.parse(await explainAnswer(parsed.data.questionId, parsed.data.answerId)));
  } catch (error) { fail(error, req, res); }
});

export default router;
