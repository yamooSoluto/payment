import { NextRequest, NextResponse } from 'next/server';
import * as postmark from 'postmark';

const client = new postmark.ServerClient(process.env.POSTMARK_SERVER_TOKEN || '');

// n8n 웹훅 URL (Enterprise 문의용)
const N8N_WEBHOOK_URL = 'https://soluto.app.n8n.cloud/webhook/enterprise-inquiry';

interface EnterpriseInquiryData {
  name: string;
  phone: string;
  companyName: string;
  storeCount: string;
  monthlyInquiries: string;
  message: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: EnterpriseInquiryData = await request.json();
    const { name, phone, companyName, storeCount, monthlyInquiries, message } = body;

    // Validate required fields
    if (!name || !phone || !companyName || !storeCount || !monthlyInquiries || !message) {
      return NextResponse.json(
        { error: '필수 항목을 모두 입력해주세요.' },
        { status: 400 }
      );
    }

    const timestamp = new Date().toISOString();
    const formattedDate = new Date().toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    // Send email notification via Postmark
    const emailResult = await client.sendEmail({
      From: 'noreply@soluto.co.kr',
      To: 'yamoo@soluto.co.kr',
      Subject: `[Enterprise 문의] ${companyName} - ${name}님`,
      HtmlBody: `
        <div style="font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); padding: 30px; border-radius: 12px 12px 0 0;">
            <h1 style="color: #f2e644; margin: 0; font-size: 24px;">Enterprise 문의 접수</h1>
            <p style="color: #888; margin: 10px 0 0 0; font-size: 14px;">${formattedDate}</p>
          </div>

          <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 12px 12px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #f0f0f0; width: 100px; color: #666; font-size: 14px;">성함</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; font-weight: 600;">${name}</td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #f0f0f0; color: #666; font-size: 14px;">연락처</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; font-weight: 600;">${phone}</td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #f0f0f0; color: #666; font-size: 14px;">회사명</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; font-weight: 600;">${companyName}</td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #f0f0f0; color: #666; font-size: 14px;">매장 수</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; font-weight: 600;">${storeCount}</td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #f0f0f0; color: #666; font-size: 14px;">월 문의 건수</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; font-weight: 600;">${monthlyInquiries}건</td>
              </tr>
            </table>

            <div style="margin-top: 24px;">
              <p style="color: #666; font-size: 14px; margin: 0 0 8px 0;">문의 내용</p>
              <div style="background: #f9f9f9; padding: 16px; border-radius: 8px; white-space: pre-wrap; font-size: 14px; line-height: 1.6;">
${message}
              </div>
            </div>

            <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #e5e5e5;">
              <p style="color: #888; font-size: 12px; margin: 0;">
                이 메일은 YAMOO 웹사이트의 Enterprise 문의 양식을 통해 자동으로 발송되었습니다.
              </p>
            </div>
          </div>
        </div>
      `,
      MessageStream: 'outbound',
    });

    // Also send to n8n webhook for additional processing
    const n8nData = {
      name,
      phone,
      companyName,
      storeCount,
      monthlyInquiries,
      message,
      timestamp,
      source: 'website_enterprise_inquiry',
    };

    try {
      await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(n8nData),
      });
    } catch (n8nError) {
      // n8n 웹훅 실패해도 이메일은 발송되었으므로 에러 로깅만
      console.error('n8n webhook error:', n8nError);
    }

    return NextResponse.json({
      success: true,
      message: '문의가 접수되었습니다.',
      emailId: emailResult.MessageID,
    });
  } catch (error) {
    console.error('Enterprise inquiry error:', error);
    return NextResponse.json(
      { error: '문의 접수 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
