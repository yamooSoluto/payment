# YAMOO 홈페이지 ↔ 포탈 연동 가이드

> 최종 업데이트: 2026-02-24

---

## 1. 현재 구조 (이메일 기반)

### 인증 방식

| 구분 | 방식 | 비고 |
|------|------|------|
| 마스터 로그인 | Firebase Auth (이메일 + PW) | Google OAuth 포함 |
| 마스터 세션 | `auth_sessions/{sessionId}` (Firestore) | 쿠키: `auth_session` |
| 어드민 로그인 | 자체 JWT | 쿠키: `admin_token` |

### Firestore 주요 컬렉션

| 컬렉션 | 키 | 설명 |
|--------|-----|------|
| `users/{email}` | doc ID = 이메일 | 마스터 회원 정보 |
| `tenants/{tenantId}` | n8n 생성 ID | 매장 정보 |
| `subscriptions/{tenantId}` | tenantId | 구독 정보 |
| `auth_sessions/{sessionId}` | as_xxxx | 홈페이지 마스터 세션 |
| `admins/{adminId}` | UUID | 어드민 계정 |

### 마스터 로그인 → 포탈 SSO 흐름

```
[홈페이지 /login]
     │ Firebase Auth (이메일 + PW)
     ▼
[AuthContext: user 세팅]
     │ 로그인 후 포탈 이동 클릭
     ▼
[GET /api/auth/login-token]
  - Firebase ID Token 검증
  - Firestore users/{email} 조회
  - 단기 SSO 토큰 생성 (10분)
     │
     ▼
[포탈: app.yamoo.ai.kr/?token=...]
  - 토큰 검증 후 포탈 세션 생성
  - 매장 선택 → 대시보드
```

### 홈페이지 세션 (`auth_sessions`)

```typescript
// lib/auth-session.ts
interface AuthSessionData {
  id: string;        // as_xxxxxx
  email: string;     // 마스터 이메일
  token?: string;    // SSO 토큰 (verify용)
  createdAt: Date;
  expiresAt: Date;   // 24시간
}
```

---

## 2. 주요 API 목록

### 마스터 인증 (`app/api/auth/`)

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/auth/save-user` | POST | 회원가입 후 Firestore users 저장 |
| `/api/auth/save-google-user` | POST | Google 로그인 후 users 저장 |
| `/api/auth/session` | GET/DELETE | 세션 조회/로그아웃 |
| `/api/auth/sso` | POST | 포탈 → 홈페이지 SSO 토큰 검증 |
| `/api/auth/login-token` | GET | 홈페이지 → 포탈 SSO 토큰 발급 |
| `/api/auth/verify-session` | GET | 세션 유효성 확인 |
| `/api/auth/check-profile` | POST | 프로필 완성 여부 확인 |
| `/api/auth/change-name` | POST | 이름 변경 |
| `/api/auth/change-phone` | POST | 연락처 변경 |
| `/api/auth/reset-password` | POST | 비밀번호 재설정 |
| `/api/auth/find-id` | POST | 이메일(ID) 찾기 |
| `/api/auth/sms-verify` | POST | SMS 인증번호 발송/확인 |

### 매니저 인증 (`app/api/auth/`) — 개발 완료

| 엔드포인트 | 메서드 | 호출 주체 | 설명 |
|-----------|--------|----------|------|
| `/api/auth/manager-login` | POST | 포탈 서버 | ID/PW 검증 → 세션 생성, 응답에 sessionId 포함 |
| `/api/auth/manager-session` | GET | 포탈 서버 | 세션 유효성 확인 |
| `/api/auth/manager-session` | DELETE | 포탈 서버 | 매니저 로그아웃 (세션 삭제) |
| `/api/auth/manager-billing-token` | POST | 포탈 서버 | 마이페이지 SSO용 단기 토큰 발급 (10분) |
| `/api/auth/manager-sso` | GET | 브라우저 | 토큰 검증 → manager_session 쿠키 설정 → /account 리다이렉트 |

### 매니저 관리 (`app/api/managers/`) — 개발 완료

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/managers` | GET | 내 매니저 목록 (마스터 auth_session 필요) |
| `/api/managers` | POST | 매니저 생성 |
| `/api/managers/[id]` | GET | 매니저 상세 조회 |
| `/api/managers/[id]` | PATCH | 매니저 정보/권한 수정 |
| `/api/managers/[id]` | DELETE | 매니저 삭제 |

---

## 3. 매니저 기능

### 개요

마스터(이메일 기반)는 기존 그대로 유지하고,
매니저는 **이메일 없이 ID/PW만으로** 포탈에 접근하는 별도 인증 시스템.
마스터가 홈페이지 `/account` 페이지에서 직접 매니저를 생성하고 매장별 접근 권한을 세밀하게 설정한다.

**로그인 방식 분리:**

| 구분 | 로그인 위치 | 방식 |
|------|-----------|------|
| 마스터 | 홈페이지 `/login` | Firebase Auth (이메일 + PW) |
| 매니저 | 포탈 로그인 페이지 | 자체 bcrypt (ID + PW) |

> 홈페이지 로그인 폼은 **마스터 전용**으로 유지. 매니저는 포탈에서만 로그인.

---

### Firestore 컬렉션 구조

```
users_managers/{managerId}
  - managerId: string          // mg_xxxxxxxx (자동생성)
  - loginId: string            // 로그인 아이디 (@ 포함 불가, 중복 불가)
  - passwordHash: string       // bcrypt 해시
  - name: string
  - phone?: string
  - slackUserId?: string       // 추후 Slack OAuth 자동 로그인 연동용 (선택)
  - masterEmail: string        // 소속 마스터 이메일
  - active: boolean            // false면 로그인 차단
  - tenants: [                 // 매장별 접근 권한
      {
        tenantId: string,
        permissions: ManagerPermissions
      }
    ]
  - createdAt: Timestamp
  - updatedAt: Timestamp

manager_sessions/{sessionId}
  - sessionId: string          // ms_xxxxxxxx
  - managerId: string
  - loginId: string
  - masterEmail: string
  - tenants: [{ tenantId, permissions }]   // 포탈이 직접 참조
  - createdAt: Timestamp
  - expiresAt: Timestamp       // 24시간
```

> `manager_session` 쿠키는 홈페이지 SSO 경유 시(`/api/auth/manager-sso`)에만 생성됨.
> 포탈은 sessionId를 자체 세션에 저장하여 관리.

---

### 권한 시스템

#### 권한 레벨 (섹션별 3단계)

| 레벨 | 설명 |
|------|------|
| `hidden` | 숨김 (메뉴 자체 비노출) |
| `read` | 조회만 가능 |
| `write` | 편집/관리/처리 가능 |

#### 포탈 섹션별 권한 정의

| 섹션 key | 섹션명 | read | write |
|----------|--------|------|-------|
| `conversations` | 대화 | 대화 조회 | 상담원으로 대화 참여 |
| `data` | 데이터 | FAQ/데이터 조회 | FAQ/데이터 편집 |
| `statistics` | 통계 | 통계 조회 | 통계 데이터 추출 |
| `tasks` | 업무 | 업무 조회 | 업무 처리 및 기록 |
| `mypage` | 마이페이지 | - | - |
| `accounts` | 계정 관리 | 계정 목록 조회 | 계정 추가/수정/삭제 |

> **`mypage` 특이사항**: `hidden`이면 결제/구독 접근 불가.
> `read | write`이면 포탈 → 홈페이지 SSO를 통해 `/account` 페이지 전체 오픈 (두 레벨 간 차이 없음).
> 포탈에서 결제 UI를 별도 구현하지 않고 홈페이지 기존 결제/구독 기능을 재사용.

> **확장 원칙**: 포탈에 새 섹션이 추가되면 `lib/manager-permissions.ts`의
> `PERMISSION_SECTIONS` 배열에 항목만 추가하면 홈페이지 ManagerForm UI에 자동 반영됨.

#### 권한 타입 정의

```typescript
// lib/manager-permissions.ts

export type PermissionLevel = 'hidden' | 'read' | 'write';

export interface PermissionSection {
  key: string;
  label: string;
  description: string;
}

export const PERMISSION_SECTIONS: PermissionSection[] = [
  { key: 'conversations', label: '대화',       description: '고객 대화 조회 및 상담 참여' },
  { key: 'data',          label: '데이터',     description: 'FAQ 및 데이터 조회/편집' },
  { key: 'statistics',    label: '통계',       description: '통계 조회 및 데이터 추출' },
  { key: 'tasks',         label: '업무',       description: '업무 조회 및 처리 기록' },
  { key: 'mypage',        label: '마이페이지', description: '결제/구독 접근 (홈페이지 SSO)' },
  { key: 'accounts',      label: '계정 관리',  description: '계정 조회 및 추가/수정/삭제' },
];

export type ManagerPermissions = Record<string, PermissionLevel>;

export const DEFAULT_PERMISSIONS: ManagerPermissions =
  Object.fromEntries(PERMISSION_SECTIONS.map(s => [s.key, 'hidden']));
```

---

### 인증 흐름

#### 포탈 매니저 로그인

```
[포탈 /login]
     │ ID + PW 입력
     ▼
[POST {홈페이지}/api/auth/manager-login]
  - users_managers에서 loginId로 조회
  - active 확인
  - bcrypt 비밀번호 검증
  - manager_sessions 생성 (tenants + permissions 포함)
  - 응답: { managerId, loginId, masterEmail, tenants, sessionId }
     │ (쿠키 없음 — 포탈이 자체 세션으로 관리)
     ▼
[포탈: 자체 세션 생성]
  - sessionId 저장
  - tenants + permissions 기반으로 메뉴 렌더링
  - 각 섹션 mypage != hidden → "마이페이지" 메뉴 표시
```

#### 매니저 마이페이지 접근 (포탈 → 홈페이지 SSO)

```
[포탈 "마이페이지" 클릭] (mypage != hidden인 경우)
     ▼
[포탈 서버: POST {홈페이지}/api/auth/manager-billing-token]
  - body: { sessionId }
  - manager_sessions 유효성 확인
  - 단기 JWT 생성 (10분, managerId + masterEmail + tenants 포함)
  - 응답: { token }
     ▼
[브라우저 리다이렉트: {홈페이지}/api/auth/manager-sso?token=xxx]
     ▼
[홈페이지: 토큰 검증 → manager_session 쿠키 설정 → /account 리다이렉트]
     ▼
[홈페이지 /account]
  - TenantList만 표시 (구독/결제 전체 오픈)
  - UserProfile, 계정삭제, 매니저관리 섹션 숨김
```

---

## 4. 포탈 구현 가이드 (포탈 팀 참고)

홈페이지 API를 호출해 매니저 인증 및 관리 기능을 포탈에 구현할 수 있다.

### 매니저 관리 UI (마스터 전용)

포탈에서 마스터가 매니저를 관리하려면 홈페이지 `/api/managers` 엔드포인트를 그대로 활용:

```
GET  /api/managers          → 매니저 목록 (마스터 세션 헤더 또는 토큰 필요)
POST /api/managers          → 매니저 생성
PATCH /api/managers/{id}   → 수정
DELETE /api/managers/{id}  → 삭제
```

> 현재 이 API는 홈페이지 `auth_session` 쿠키로 마스터를 인증한다.
> 포탈에서 호출할 경우 마스터 인증 방식 협의 필요 (Bearer 토큰 또는 별도 API 키).

### Slack 연동 (추후)

매니저 계정의 `slackUserId` 필드를 활용해 Slack OAuth 자동 로그인 구현 가능:
1. 포탈에서 Slack OAuth 흐름 처리
2. 획득한 `slackUserId`로 `GET /api/managers/by-slack?slackUserId=xxx` 호출 (추후 추가 예정)
3. 해당 매니저로 자동 로그인

---

## 5. 현재 배포 상태

- **홈페이지**: Vercel (yamoo-payment)
- **포탈**: 별도 서버 (app.yamoo.ai.kr)
- **인증**: Firebase Auth (마스터) + bcrypt 자체 인증 (매니저)
- **DB**: Firebase Firestore (서울 리전 `asia-northeast3`)

---

## 6. 개발 시 주의사항

- `users/{email}` doc ID가 이메일이므로 대소문자 주의 (`toLowerCase()` 필수)
- 매니저 `loginId`는 `@` 포함 불가 (서버에서 검증)
- `loginId` 중복 불가 — 전체 마스터에 걸쳐 중복 확인 필요 (`users_managers` 전체 조회)
- 홈페이지 쿠키: `auth_session` (마스터), `manager_session` (매니저 SSO 경유 시)
- 마스터와 매니저 **동시 로그인 가능** (각각 다른 쿠키)
- `manager-billing-token`은 10분 단기 JWT (일회용)
- `PERMISSION_SECTIONS` 배열 수정 시 기존 매니저 `permissions`에 새 key가 없을 수 있음
  → 없는 key는 `hidden`으로 처리 (포탈에서 fallback 처리 필요)
