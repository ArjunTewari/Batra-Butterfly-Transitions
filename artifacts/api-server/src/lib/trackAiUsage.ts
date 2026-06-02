import { db, aiUsageTable } from "@workspace/db";

// Pricing as of Claude 3.5 Sonnet / claude-opus-4-7 equivalent
// Input: $3 per million tokens, Output: $15 per million tokens
const INPUT_COST_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 15 / 1_000_000;

export async function trackAiUsage({
  accountId,
  model,
  feature,
  inputTokens,
  outputTokens,
}: {
  accountId: number;
  model: string;
  feature: string;
  inputTokens: number;
  outputTokens: number;
}) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const costUsd = inputTokens * INPUT_COST_PER_TOKEN + outputTokens * OUTPUT_COST_PER_TOKEN;

  await db.insert(aiUsageTable).values({
    accountId,
    model,
    feature,
    inputTokens,
    outputTokens,
    costUsd: String(costUsd),
    month,
    year,
  });

  return { inputTokens, outputTokens, costUsd };
}
