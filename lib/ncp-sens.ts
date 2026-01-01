/**
 * 네이버 클라우드 플랫폼 SENS SMS API 연동
 * https://api.ncloud-docs.com/docs/ai-application-service-sens-smsv2
 */

import crypto from 'crypto';

interface SENSConfig {
  accessKey: string;
  secretKey: string;
  serviceId: string;
  senderPhone: string;
}

interface SENSSendResult {
  requestId: string;
  requestTime: string;
  statusCode: string;
  statusName: string;
}

function getConfig(): SENSConfig {
  const accessKey = process.env.NCP_ACCESS_KEY;
  const secretKey = process.env.NCP_SECRET_KEY;
  const serviceId = process.env.NCP_SMS_SERVICE_ID;
  const senderPhone = process.env.NCP_SMS_SENDER_PHONE;

  if (!accessKey || !secretKey || !serviceId || !senderPhone) {
    throw new Error('NCP SENS 환경변수가 설정되지 않았습니다. NCP_ACCESS_KEY, NCP_SECRET_KEY, NCP_SMS_SERVICE_ID, NCP_SMS_SENDER_PHONE을 확인해주세요.');
  }

  return { accessKey, secretKey, serviceId, senderPhone };
}

/**
 * HMAC-SHA256 서명 생성
 */
function makeSignature(method: string, url: string, timestamp: string, accessKey: string, secretKey: string): string {
  const space = ' ';
  const newLine = '\n';

  const message = [
    method,
    space,
    url,
    newLine,
    timestamp,
    newLine,
    accessKey,
  ].join('');

  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(message);
  return hmac.digest('base64');
}

/**
 * SMS 발송
 */
export async function sendSMS(phone: string, message: string): Promise<SENSSendResult> {
  const config = getConfig();
  const timestamp = Date.now().toString();
  const url = `/sms/v2/services/${config.serviceId}/messages`;

  const signature = makeSignature('POST', url, timestamp, config.accessKey, config.secretKey);

  const body = {
    type: 'SMS',
    from: config.senderPhone.replace(/-/g, ''),
    content: message,
    messages: [
      {
        to: phone.replace(/-/g, ''),
      },
    ],
  };

  const response = await fetch(`https://sens.apigw.ntruss.com${url}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'x-ncp-apigw-timestamp': timestamp,
      'x-ncp-iam-access-key': config.accessKey,
      'x-ncp-apigw-signature-v2': signature,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('NCP SENS 오류:', errorText);
    throw new Error(`NCP SENS API 오류: ${response.status}`);
  }

  const result: SENSSendResult = await response.json();

  if (result.statusCode !== '202') {
    throw new Error(`NCP SENS 발송 실패: ${result.statusName}`);
  }

  return result;
}

/**
 * LMS 발송 (장문)
 */
export async function sendLMS(phone: string, message: string, subject?: string): Promise<SENSSendResult> {
  const config = getConfig();
  const timestamp = Date.now().toString();
  const url = `/sms/v2/services/${config.serviceId}/messages`;

  const signature = makeSignature('POST', url, timestamp, config.accessKey, config.secretKey);

  const body: Record<string, unknown> = {
    type: 'LMS',
    from: config.senderPhone.replace(/-/g, ''),
    content: message,
    messages: [
      {
        to: phone.replace(/-/g, ''),
      },
    ],
  };

  if (subject) {
    body.subject = subject;
  }

  const response = await fetch(`https://sens.apigw.ntruss.com${url}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'x-ncp-apigw-timestamp': timestamp,
      'x-ncp-iam-access-key': config.accessKey,
      'x-ncp-apigw-signature-v2': signature,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('NCP SENS 오류:', errorText);
    throw new Error(`NCP SENS API 오류: ${response.status}`);
  }

  const result: SENSSendResult = await response.json();

  if (result.statusCode !== '202') {
    throw new Error(`NCP SENS 발송 실패: ${result.statusName}`);
  }

  return result;
}

/**
 * 인증번호 SMS 발송
 */
export async function sendVerificationSMS(phone: string, code: string): Promise<SENSSendResult> {
  const message = `[YAMOO] 인증번호 ${code}`;
  return sendSMS(phone, message);
}
