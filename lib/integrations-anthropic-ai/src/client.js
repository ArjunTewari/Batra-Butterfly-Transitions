import Anthropic from "@anthropic-ai/sdk";
// Support direct API key (user-provided) OR Replit AI integration proxy
const hasDirectKey = !!process.env.ANTHROPIC_API_KEY;
const hasProxy = !!process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL && !!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
if (!hasDirectKey && !hasProxy) {
    throw new Error("No Anthropic API key configured. Set ANTHROPIC_API_KEY (direct key) or provision the Anthropic AI integration.");
}
export const anthropic = hasDirectKey
    ? new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
    })
    : new Anthropic({
        apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
    });
