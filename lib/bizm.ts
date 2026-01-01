/**
 * 비즈엠 SMS/알림톡 API 연동
 * https://www.bizmsg.kr/
 */

interface BizmSendResult {
  code: string;
  message: string;
  data?: {
    msgId: string;
  };
}

interface BizmConfig {
  userId: string;
  profileKey: string;
  senderPhone: string;
}

function getConfig(): BizmConfig {
  const userId = process.env.BIZM_USER_ID;
  const profileKey = process.env.BIZMSG_SENDER_KEY || process.env.BIZM_PROFILE_KEY;
  const senderPhone = process.env.BIZM_SENDER_PHONE;

  if (!userId || !profileKey || !senderPhone) {
    throw new Error('비즈엠 환경변수가 설정되지 않았습니다. BIZM_USER_ID, BIZMSG_SENDER_KEY, BIZM_SENDER_PHONE을 확인해주세요.');
  }

  return { userId, profileKey, senderPhone };
}

/**
 * SMS 발송 (단문)
 */
export async function sendSMS(phone: string, message: string): Promise<BizmSendResult> {
  const config = getConfig();

  const response = await fetch('https://alimtalk-api.bizmsg.kr/v2/sender/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'userId': config.userId,
    },
    body: JSON.stringify({
      message_type: 'SM', // SMS 단문
      phn: phone.replace(/-/g, ''), // 하이픈 제거
      profile: config.profileKey,
      smsSndNum: config.senderPhone,
      smsMsg: message,
    }),
  });

  if (!response.ok) {
    throw new Error(`비즈엠 API 오류: ${response.status}`);
  }

  return response.json();
}

/**
 * LMS 발송 (장문)
 */
export async function sendLMS(phone: string, message: string, title?: string): Promise<BizmSendResult> {
  const config = getConfig();

  const response = await fetch('https://alimtalk-api.bizmsg.kr/v2/sender/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'userId': config.userId,
    },
    body: JSON.stringify({
      message_type: 'LM', // LMS 장문
      phn: phone.replace(/-/g, ''),
      profile: config.profileKey,
      smsSndNum: config.senderPhone,
      smsMsg: message,
      smsTitle: title,
    }),
  });

  if (!response.ok) {
    throw new Error(`비즈엠 API 오류: ${response.status}`);
  }

  return response.json();
}

/**
 * 알림톡 발송
 */
export async function sendAlimtalk(
  phone: string,
  templateCode: string,
  variables: Record<string, string>,
  fallbackSmsMessage?: string
): Promise<BizmSendResult> {
  const config = getConfig();

  const body: Record<string, unknown> = {
    message_type: 'AT', // 알림톡
    phn: phone.replace(/-/g, ''),
    profile: config.profileKey,
    tmplId: templateCode,
    msg: variables,
  };

  // SMS 대체 발송 설정 (알림톡 실패 시)
  if (fallbackSmsMessage) {
    body.smsKind = 'S';
    body.smsSndNum = config.senderPhone;
    body.smsMsg = fallbackSmsMessage;
  }

  const response = await fetch('https://alimtalk-api.bizmsg.kr/v2/sender/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'userId': config.userId,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`비즈엠 API 오류: ${response.status}`);
  }

  return response.json();
}

/**
 * 인증번호 SMS 발송
 */
export async function sendVerificationSMS(phone: string, code: string): Promise<BizmSendResult> {
  const message = `[YAMOO] 인증번호는 ${code}입니다. 5분 내에 입력해주세요.`;
  return sendSMS(phone, message);
}
