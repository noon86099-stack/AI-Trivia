import { pgTable, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

export type TriviaPayload = {
  id: string;
  question: string;
  category: string;
  difficulty: "easy" | "medium" | "hard";
  options: { id: string; text: string }[];
};

export const triviaQuestionsTable = pgTable("trivia_questions", {
  id: text("id").primaryKey(),
  payload: jsonb("payload").$type<TriviaPayload>().notNull(),
  correctId: text("correct_id").notNull(),
  explanations: jsonb("explanations").$type<Record<string, string>>().notNull().default({}),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, table => [index("trivia_questions_expiry_idx").on(table.expiresAt)]);
