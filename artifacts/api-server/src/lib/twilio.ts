import twilio from "twilio";
import { logger } from "./logger";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_WHATSAPP_FROM; // e.g. "whatsapp:+14155238886"

let client: ReturnType<typeof twilio> | null = null;

function getClient() {
  if (!client && accountSid && authToken) {
    client = twilio(accountSid, authToken);
  }
  return client;
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  if (digits.length === 10 && digits.startsWith("9")) return `+91${digits}`;
  if (digits.startsWith("1") && digits.length === 11) return `+${digits}`;
  if (digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (digits.startsWith("+")) return `+${digits.slice(1)}`;
  return `+${digits}`;
}

export async function sendWhatsAppMessage(
  to: string,
  body: string,
): Promise<void> {
  const twilioClient = getClient();
  if (!twilioClient || !fromNumber) {
    logger.warn(
      { to, body: body.slice(0, 60) },
      "Twilio not configured. Skipping WhatsApp message.",
    );
    return;
  }

  const normalizedTo = normalizePhone(to);
  const toNumber = `whatsapp:${normalizedTo}`;
  const fromWhatsApp = fromNumber.startsWith("whatsapp:")
    ? fromNumber
    : `whatsapp:${fromNumber}`;

  logger.info({ to: toNumber, from: fromWhatsApp }, "Sending WhatsApp message...");

  try {
    const message = await twilioClient.messages.create({
      from: fromWhatsApp,
      to: toNumber,
      body,
    });
    logger.info(
      { messageSid: message.sid, to: toNumber, status: message.status },
      "WhatsApp message queued",
    );
  } catch (err) {
    logger.error(
      { error: (err as Error).message, to: toNumber, from: fromWhatsApp },
      "Failed to send WhatsApp message",
    );
  }
}
