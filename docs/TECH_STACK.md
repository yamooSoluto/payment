# YAMOO Payment - Tech Stack

## Language
- **TypeScript** ^5.0.0

## Server
- **Next.js** 15.5.7 (App Router)
- **Node.js** (Runtime)

## Deployment
- **Vercel**

## DB/Backend
- **Firebase** ^10.7.0
  - Firestore (NoSQL Database)
  - Firebase Admin SDK ^12.0.0
- **Postmark** ^4.0.5 (Email Service)

## Payment
- **Toss Payments**
  - @tosspayments/payment-widget-sdk ^0.9.0
  - @tosspayments/tosspayments-sdk ^2.5.0

## UI
- **Framework**: Tailwind CSS ^3.4.0
- **Font**: Pretendard (CDN)
- **Icons**:
  - **Iconoir React** ^7.11.0 (메인)
  - Lucide React ^0.468.0 (서브)
- **Components**:
  - Radix UI (Dialog, Slot)
  - Tiptap (Rich Text Editor)

## Admin
- 자체 구현 (Next.js App Router 기반)
- JWT 인증 (jsonwebtoken ^9.0.2)
- bcryptjs ^3.0.3 (비밀번호 암호화)

## Utilities
- **axios** ^1.6.0 - HTTP Client
- **date-fns** ^3.0.0 - 날짜 처리
- **jsPDF** ^3.0.4 - PDF 생성
- **uuid** ^13.0.0 - UUID 생성
- **clsx** + **tailwind-merge** - 클래스명 유틸리티
- **class-variance-authority** - 컴포넌트 변형 관리

## Brand Colors
| Name | Hex | Usage |
|------|-----|-------|
| Primary | `#ffbf03` | 메인 브랜드 컬러 |
| Secondary | `#e6ac00` | 보조 컬러 |
| Accent | `#ffd54f` | 강조 컬러 |
| Dark | `#b38600` | 텍스트/링크용 진한 컬러 |

---

## Architecture

### Project Structure
```
yamoo-payment/
├── app/                    # Next.js App Router
│   ├── api/                # API Routes
│   │   ├── admin/          # 관리자 API (인증, 회원, 주문, 플랜 등)
│   │   ├── payments/       # 결제 API (confirm, upgrade, retry 등)
│   │   ├── subscriptions/  # 구독 API (cancel, change-plan 등)
│   │   ├── cards/          # 카드 관리 API
│   │   ├── webhooks/       # Toss 웹훅
│   │   └── cron/           # 정기결제 스케줄러
│   ├── admin/              # 관리자 페이지
│   ├── account/            # 마이페이지
│   ├── checkout/           # 결제 페이지
│   ├── pricing/            # 요금제 페이지
│   └── login/              # 로그인 페이지
├── components/             # React 컴포넌트
│   ├── admin/              # 관리자 컴포넌트
│   ├── account/            # 마이페이지 컴포넌트
│   ├── checkout/           # 결제 컴포넌트
│   ├── pricing/            # 요금제 컴포넌트
│   └── modals/             # 모달 컴포넌트
├── lib/                    # 유틸리티 & 서비스
│   ├── firebase.ts         # Firebase Client SDK
│   ├── firebase-admin.ts   # Firebase Admin SDK
│   ├── toss.ts             # Toss Payments 유틸
│   ├── auth.ts             # 사용자 인증
│   ├── admin-auth.ts       # 관리자 인증
│   └── idempotency.ts      # 멱등성 키 유틸
└── public/                 # 정적 파일
```

### Data Flow
```
[Client] → [Next.js API Routes] → [Firebase Firestore]
                ↓
         [Toss Payments API]
                ↓
         [Webhook] → [정기결제 처리]
```

### Key Features
| 기능 | 설명 |
|-----|------|
| 구독 관리 | Trial, Basic, Business 플랜 |
| 결제 처리 | Toss Payments 빌링키 기반 |
| 정기 결제 | Vercel Cron + Toss 자동결제 |
| 플랜 변경 | 업그레이드/다운그레이드 (비례계산) |
| 카드 관리 | 다중 카드 등록/변경/삭제 |
| 관리자 | 회원/운영자/상품/주문/플랜/약관 관리 |
| 알림 | Postmark 이메일 발송 |
| 결제 안정성 | 멱등성 키로 중복 결제 방지 |
