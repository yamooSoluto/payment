/**
 * N8N 웹훅 헬퍼
 * 알림성 웹훅을 중앙에서 관리 (trial/tenant 생성은 별도)
 */

/**
 * 알림성 웹훅 활성화 여부
 * false로 설정하면 결제/해지/탈퇴 등 알림 웹훅 비활성화
 * (trial/tenant 생성 웹훅은 영향 없음 - 별도 로직)
 */
export const ENABLE_N8N_NOTIFICATION_WEBHOOKS = false;

interface N8NWebhookPayload {
  event: string;
  [key: string]: unknown;
}

/**
 * N8N 알림 웹훅 호출
 * ENABLE_N8N_NOTIFICATION_WEBHOOKS가 false면 아무것도 하지 않음
 *
 * 주의: trial/tenant 생성 웹훅은 이 함수를 사용하지 않음
 * (trial/create, trial/apply, tenants/route에서 직접 호출)
 */
export async function sendN8NWebhook(payload: N8NWebhookPayload): Promise<void> {
  // 비활성화 상태면 무시
  if (!ENABLE_N8N_NOTIFICATION_WEBHOOKS) {
    console.log(`[N8N] Notification webhook disabled, skipping: ${payload.event}`);
    return;
  }

  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!webhookUrl) {
    return;
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    // 웹훅 실패해도 메인 로직에 영향 주지 않음
    console.error('N8N webhook failed:', error);
  }
}

/**
 * N8N 알림 웹훅이 활성화되어 있는지 확인
 */
export function isN8NNotificationEnabled(): boolean {
  return ENABLE_N8N_NOTIFICATION_WEBHOOKS && !!process.env.N8N_WEBHOOK_URL;
}
