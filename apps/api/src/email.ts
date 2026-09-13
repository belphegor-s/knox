// Resend's plain REST API over fetch - no SDK dependency for a single call. RESEND_API_KEY
// comes from the standard environment (never logged, never included in any response).
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_ADDRESS = process.env.KNOX_MAGIC_LINK_FROM ?? "Knox <noreply@procd.cc>";

export async function sendMagicLinkEmail(to: string, verifyUrl: string): Promise<void> {
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to,
      subject: "Sign in to Knox",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto;">
          <h1 style="font-size: 18px;">Sign in to Knox</h1>
          <p style="color: #444; font-size: 14px; line-height: 1.6;">Click the button below to sign in. This link expires in 15 minutes and can only be used once.</p>
          <p style="margin: 24px 0;">
            <a href="${verifyUrl}" style="background: #c1602f; color: #fff6f0; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Sign in</a>
          </p>
          <p style="color: #888; font-size: 12px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
      text: `Sign in to Knox: ${verifyUrl}\n\nThis link expires in 15 minutes and can only be used once. If you didn't request this, you can safely ignore this email.`,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend API error (${res.status}): ${body}`);
  }
}
