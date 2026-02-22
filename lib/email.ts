/**
 * Resend 이메일 발송 유틸리티
 *
 * RESEND_API_KEY 미설정 시 자동 skip
 */

import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const ALERT_EMAIL_FROM = process.env.ALERT_EMAIL_FROM || 'onboarding@resend.dev';
const ALERT_EMAIL_TO = process.env.ALERT_EMAIL_TO || '';

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  if (!RESEND_API_KEY) return null;
  if (!resendClient) {
    resendClient = new Resend(RESEND_API_KEY);
  }
  return resendClient;
}

/**
 * 알림 이메일 발송
 * @returns true if sent, false if skipped or failed
 */
export async function sendAlertEmail(subject: string, html: string): Promise<boolean> {
  const resend = getResend();

  if (!resend || !ALERT_EMAIL_TO) {
    return false;
  }

  try {
    await resend.emails.send({
      from: ALERT_EMAIL_FROM,
      to: ALERT_EMAIL_TO,
      subject,
      html,
    });
    console.log(`[Email] Alert email sent: ${subject}`);
    return true;
  } catch (error) {
    console.error('[Email] Failed to send alert email:', error instanceof Error ? error.message : error);
    return false;
  }
}
