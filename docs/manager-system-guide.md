# 매니저 시스템 리디자인 - 포탈/대시보드 가이드

## 변경 요약

기존 `masterEmail` 기반 소속 모델에서 **독립 계정 + 초대 모델**로 변경됨.

### 핵심 변경사항
- 매니저는 자체 회원가입 (포탈에서만)
- 마스터는 매장/권한 선택 후 초대 링크 생성 → 매니저에게 전달
- `masterEmail` 필드 제거 → `tenantId` 기반 조회
- 소유자 이전 시 매니저 자동 승계 (별도 처리 불필요)
- 계정 관리: 매니저 본인만 (비밀번호/이름), 관리자(adminId 있음)는 수정 불가
- 계정 삭제: 본인 + 어드민만
- 마스터는 자기 매장에서 매니저 내보내기만 가능 (어드민이 생성한 관리자 계정은 내보내기 불가)

### 관리자(admin) vs 매니저(manager) 판별 기준 (완료)

**판별 방법:** `users_managers` 문서의 `adminId` 필드 존재 여부로 결정
- `adminId` 값 있음 → 관리자 (type: 'admin')
- `adminId` 값 없음 → 매니저 (type: 'manager')

> `createdByAdmin: true`는 관리자 판별에 사용하지 않음. `createdByAdmin`은 어드민 패널에서 생성 여부만 의미.

**적용 파일:**
- `lib/manager-auth.js` — `loginManager()`, `verifyManagerSession()` 모두 `data.adminId ? 'admin' : 'manager'`
- `pages/api/auth/manager-login.js` — 응답에 `type` 필드 포함
- `pages/api/auth/verify-session.js` — 세션 검증 응답에 `type` 필드 포함
- `contexts/TenantContext.tsx` — `ManagerInfo` 인터페이스에 `type` 필드 추가

### 역할 표시 UI (완료)

사이드바 하단 프로필 영역 및 프로필 팝업에서 역할별 색상 구분:

| 역할 | 라벨 | 색상 |
|------|------|------|
| 관리자 | 관리자 | `text-violet-500` (보라) |
| 매니저 | 매니저 | `text-amber-500` (노랑) |
| 마스터 | 마스터 | `text-blue-500` (파랑) |

**관리자 제한사항 (사이드바 팝업):**
- 이름 수정 버튼(연필 아이콘) 숨김
- 비밀번호 변경 버튼 숨김
- 마스터 이메일 비노출

### 계정 관리 UI 위치 변경 (완료)

기존 SettingsPage의 "내 계정" 섹션을 사이드바 프로필 팝업으로 이동:
- 팝업 두 개 뷰: 'main' (기본 정보 + 로그아웃) / 'password' (비밀번호 변경 폼)
- 매니저만 이름 편집, 비밀번호 변경 가능
- 관리자는 정보 조회 + 로그아웃만 가능

**적용 파일:**
- `components/layout/VerticalSidebar.tsx` — 팝업 UI + 이름 편집 + 비밀번호 변경
- `components/mypage/SettingsPage.tsx` — "내 계정" 섹션 제거

---

## 포탈 (datapage-main) 변경사항

### 1. 매니저 로그인 응답 변경 (완료)

**현재 응답 형식:**
```json
{
  "managerId": "mg_xxx",
  "loginId": "cafe_staff01",
  "name": "홍길동",
  "type": "manager",       // 'admin' | 'manager' (adminId 기반 판별)
  "tenants": [...],
  "firebase": { "customToken": "...", "claims": {...} }
}
```

- `masterEmail` 필드 삭제됨
- `type` 필드 추가됨 (`adminId` 존재 여부로 결정)
- `sessionId`는 응답 body에 포함하지 않음 (httpOnly 쿠키 `manager_session`으로 설정)
- Firebase Custom Token 발급 포함

**적용 파일:** `pages/api/auth/manager-login.js`

### 1-1. 포탈 로그인 페이지 UI 구분

포탈 로그인 페이지에서 마스터/매니저 탭을 분리하여 혼동 방지:

| 구분 | 마스터 탭 | 매니저 탭 |
|------|----------|----------|
| 로그인 | O (이메일 + 비밀번호) | O (아이디 + 비밀번호) |
| 아이디 찾기 | X (홈페이지 안내 링크) | O (SMS 인증) |
| 비밀번호 찾기 | X (홈페이지 안내 링크) | O (SMS 인증) |
| 회원가입 | X (홈페이지 안내 링크) | O |

> **SMS 인증:** 포탈에서 yamoo-payment의 `/api/auth/sms-verify` API를 호출하는 방식. SMS 관련 환경변수는 yamoo-payment 서버에만 있으면 됨 (포탈에 별도 추가 불필요).

> **마스터 안내:** 마스터 탭의 아이디/비밀번호 찾기에는 "홈페이지에서 찾기" 링크를 표시하여 홈페이지로 안내.

### 2. 세션 조회 응답 변경 (완료)

**매니저 세션 응답 형식 (`GET /api/auth/verify-session` → manager_session 쿠키 폴백):**
```json
{
  "success": true,
  "email": "loginId@manager.yamoo.ai",
  "name": "홍길동",
  "source": "manager",
  "tenants": [...],
  "firebase": { "customToken": "...", "claims": {...} },
  "manager": {
    "managerId": "mg_xxx",
    "loginId": "cafe_staff01",
    "type": "manager",    // 'admin' | 'manager'
    "tenants": [...]
  }
}
```

- `masterEmail` 필드 삭제됨
- `manager.type` 필드 추가됨

**적용 파일:** `pages/api/auth/verify-session.js`

### 3. TenantContext 매니저 정보 관리 (완료)

`ManagerInfo` 인터페이스에 `type` 필드 추가:
```typescript
interface ManagerInfo {
  managerId: string;
  loginId: string;
  name: string;
  type: string;       // 'admin' | 'manager'
  tenants: any[];
}
```

로그인/세션 복원 두 경로 모두 `type` 필드 설정:
- 로그인 흐름: `type: data.type || 'manager'`
- 세션 복원 흐름: `type: data.manager.type || 'manager'`

**적용 파일:** `contexts/TenantContext.tsx`

### 4. 사이드바 프로필 UI (완료)

사이드바 하단 프로필 및 팝업에서 역할별 표시:

**사이드바 하단:**
- 마스터: 마스터 이름 또는 이메일 표시, "마스터" 라벨 (파랑)
- 매니저: 매니저 이름 표시, "매니저" 라벨 (노랑)
- 관리자: 매니저 이름 표시, "관리자" 라벨 (보라)

**프로필 팝업 (두 개 뷰):**
- `main` 뷰: 이름 + loginId + 역할 라벨 + 이름 편집 + 비밀번호 변경 버튼 + 로그아웃
- `password` 뷰: 현재 비밀번호 + 새 비밀번호 + 확인 입력 폼

**관리자 제한:**
- 이름 수정 연필 아이콘 숨김 (`managerType !== 'admin'` 조건)
- 비밀번호 변경 버튼 숨김 (`managerType !== 'admin'` 조건)
- 마스터 이메일 비노출

**매니저만 허용 (마스터 차단):**
- 매장 추가 버튼 숨김 (`!isManager` 조건)

**적용 파일:** `components/layout/VerticalSidebar.tsx`, `pages/index.js` (props 전달)

### 5. SettingsPage 계정 섹션 제거 (완료)

기존 SettingsPage의 "내 계정" 섹션(이름 편집, loginId 표시, 비밀번호 변경) 전체 제거.
계정 관리 기능은 사이드바 프로필 팝업으로 이동됨.

제거된 항목:
- 이름 인라인 편집 UI + 상태 (editingName, nameValue, nameSaving, handleSaveName)
- 비밀번호 변경 DetailPage + 상태 (pwCurrent, pwNew, pwConfirm 등)
- 이메일 표시 (구독 영역)

**적용 파일:** `components/mypage/SettingsPage.tsx`

### 6. 매니저 인증 핵심 로직 (완료)

`lib/manager-auth.js`의 두 핵심 함수에서 관리자 판별:

```javascript
// loginManager() — 로그인 시
type: data.adminId ? 'admin' : 'manager',

// verifyManagerSession() — 세션 검증 시
type: manager.adminId ? 'admin' : 'manager',
```

> `createdByAdmin`이 아니라 `adminId` 필드 존재 여부로 판별함에 주의.

### 7. 매니저 회원가입 페이지 (미완료, 포탈에서만)

`POST /api/auth/manager-register`
```json
{
  "loginId": "cafe_staff01",
  "password": "Pass!123",
  "name": "홍길동",
  "phone": "010-0000-0000",  // 필수
  "phoneVerified": true,      // 필수 (SMS 인증 완료)
  "agreedToTerms": true       // 필수
}
```

> 포탈에서 이용약관/개인정보처리방침 동의 체크박스 구현 필요. `agreedToTerms: false`이면 400 에러.

> **참고:** 매니저 회원가입은 포탈에서만 가능합니다. 대시보드에서는 회원가입 불가.

#### SMS 인증 (회원가입/아이디 찾기/비밀번호 찾기 공통)

기존 마스터용 `POST /api/auth/sms-verify` API를 재사용합니다. purpose만 매니저용으로 구분:

| purpose | 용도 | 중복/존재 체크 |
|---------|------|--------------|
| `manager-signup` | 회원가입 | 같은 번호 매니저 있으면 차단 |
| `manager-find-id` | 아이디 찾기 | 해당 번호 매니저 없으면 차단 |
| `manager-reset-password` | 비밀번호 재설정 | 해당 번호 매니저 없으면 차단 |

흐름: SMS 발송(`action: "send"`) → 인증번호 확인(`action: "verify"`) → 본 API 호출(`phoneVerified: true`)

### 7-1. 아이디 찾기 (미완료)

`POST /api/auth/manager-find-id`
```json
{ "name": "홍길동", "phone": "010-0000-0000", "phoneVerified": true }
```
응답: `{ "accounts": [{ "maskedLoginId": "ca********" }] }`

### 7-2. 비밀번호 재설정 (미완료)

`POST /api/auth/manager-reset-password`
```json
{ "loginId": "cafe_staff01", "name": "홍길동", "phone": "010-0000-0000", "newPassword": "New!pass1", "phoneVerified": true }
```

#### 약관/개인정보처리방침 연동

포탈 회원가입 페이지에서 `GET /api/terms` (yamoo-payment API)를 호출하여 홈페이지와 동일한 약관을 표시합니다.

- **API**: `GET /api/terms` → `termsOfService`, `privacyPolicy` 필드 사용 (홈페이지와 동일한 배포 약관)
- **이용약관**: 제2조에서 매니저를 "이용자"에 포함
- **개인정보처리방침**: 수집방법에 "포탈(매니저 회원가입)" 반영 필요

### 8. 매니저 프로필 수정 API (미완료)

`PATCH /api/auth/manager-profile?sessionId=ms_xxx`
```json
{
  "name": "새이름",
  "phone": "010-1234-5678",
  "password": "NewPass!456"  // 선택
}
```

### 9. 매니저 초대 시스템 (완료)

기존: "매니저 추가" → 계정 생성 폼
변경: "매니저 초대" → 매장 선택 + 권한 설정 → 초대 링크 생성

#### 초대 전체 흐름

```
마스터(홈페이지/포탈)        yamoo-payment           포탈(datapage-main)          매니저
     │                          │                          │                    │
     │ 1) "매니저 초대" 클릭      │                          │                    │
     │ ──매장+권한 선택──────────>│                          │                    │
     │                          │ createInvitation()        │                    │
     │                          │ → manager_invitations 저장 │                    │
     │ <──inviteToken 반환───────│                          │                    │
     │                          │                          │                    │
     │ 2) 초대 링크 복사 (7일 만료) │                          │                    │
     │ ────────────────────────────────────────────────────────> 링크 전달        │
     │                          │                          │                    │
     │                          │                          │ 3) /invite?token=xxx│
     │                          │                          │ <──────────────────│
     │                          │                          │ invite-info API    │
     │                          │                          │ → 매장명/초대자 표시 │
     │                          │                          │                    │
     │                          │                          │ 4) "참여하기" 클릭   │
     │                          │ acceptInvitation()       │ ─────────────────> │
     │                          │ → tenants 배열 업데이트    │                    │
     │                          │ → dashboard_link 자동 생성│                    │
     │                          │                          │ 5) 홈으로 리다이렉트  │
```

#### 백엔드 API (yamoo-payment)

**초대 생성:** `POST /api/managers/invite`
- 인증: 쿠키(`auth_session`) 또는 `x-internal-key` + `x-master-email` 헤더
- 요청: `{ tenants: [{ tenantId, permissions }] }`
- 내 매장인지 `getMasterTenantIds()`로 검증
- `manager_invitations` 컬렉션에 저장 (7일 만료, status: 'pending')
- 응답: `{ inviteToken: "inv_xxx..." }`

**초대 수락:** `POST /api/managers/invite/accept`
- 요청: `{ inviteToken, sessionId }`
- 매니저 세션 검증 → 초대 상태 확인 (pending/만료 체크)
- `users_managers` 문서의 `tenants`, `tenantIds` 배열에 새 매장 추가 (중복 무시)
- 초대 상태를 `accepted`로 변경 + `acceptedBy`, `acceptedAt` 기록
- `dashboard_stores`에 해당 매장이 있으면 `dashboard_manager_links` 자동 생성 (`staffPermissions: {}`)

**초대 해제:** `DELETE /api/managers/{id}/tenants/{tenantId}`
- 마스터 세션 필수 + 내 매장인지 검증
- 어드민 생성 관리자(`createdByAdmin: true`)는 내보내기 불가 (403)
- `users_managers` 문서에서 해당 tenantId 제거
- `dashboard_manager_links` 해당 link도 자동 삭제

**권한 수정:** `PATCH /api/managers/{id}/tenants/{tenantId}`
- 마스터 세션 필수 + 내 매장인지 검증
- 요청: `{ permissions: { conversations: 'read', data: 'write', ... } }`
- `users_managers` 문서의 해당 tenant 항목 permissions 업데이트

**매니저 검색:** `GET /api/managers/search?loginId=xxx`
- loginId로 매니저 검색 (초대 전 확인용)
- 응답: `{ managerId, loginId, name }`

#### 핵심 데이터 모델

**`manager_invitations` 컬렉션:**
```
manager_invitations/{inviteToken}
  ├─ inviteToken: "inv_xxx..."  (32자 랜덤)
  ├─ invitedBy: "master@email.com"
  ├─ tenants: [{ tenantId, permissions: { conversations: 'read', ... } }]
  ├─ status: "pending" | "accepted"
  ├─ expiresAt: Date  (생성 후 7일)
  ├─ acceptedBy: "mg_xxx"  (수락 시)
  ├─ acceptedAt: Date      (수락 시)
  └─ createdAt: Date
```

**`ManagerTenantAccess` 타입:**
```typescript
interface ManagerTenantAccess {
  tenantId: string;
  permissions: ManagerPermissions;  // Record<string, PermissionLevel>
}
```

**`ManagerPermissions` 권한 섹션:**
| key | label | 설명 |
|-----|-------|------|
| `conversations` | 대화 | 고객 대화 조회 및 상담 참여 |
| `data` | 데이터 | FAQ 및 데이터 조회/편집 |
| `statistics` | 통계 | 통계 조회 및 데이터 추출 |
| `tasks` | 업무 | 업무 조회 및 처리 기록 |
| `mypage` | 마이페이지 | 결제/구독 접근 (홈페이지 SSO) |
| `accounts` | 계정 관리 | 계정 조회 및 추가/수정/삭제 |

**`PermissionLevel`:** `'hidden'` | `'read'` | `'write'`

**적용 파일 (yamoo-payment):**
- `app/api/managers/invite/route.ts` — 초대 생성 API
- `app/api/managers/invite/accept/route.ts` — 초대 수락 API
- `app/api/managers/[id]/tenants/[tenantId]/route.ts` — 권한 수정/초대 해제
- `app/api/managers/search/route.ts` — loginId 검색
- `lib/manager-auth.ts` — `createInvitation()`, `acceptInvitation()`, `removeManagerFromTenant()`, `updateManagerTenantPermissions()`, `createDashboardLinkIfStoreExists()`
- `lib/manager-permissions.ts` — `PERMISSION_SECTIONS`, `ManagerPermissions`, `PermissionLevel` 타입

#### 포탈 프록시 API (datapage-main)

포탈에서 yamoo-payment API를 직접 호출하지 않고 프록시를 경유:

| 포탈 API | yamoo-payment API | 인증 |
|----------|------------------|------|
| `POST /api/managers/invite` | `POST /api/managers/invite` | `yamoo_session` JWT → `x-internal-key` + `x-master-email` |
| `POST /api/managers/invite-accept` | `POST /api/managers/invite/accept` | `manager_session` 쿠키 → sessionId 전달 |
| `GET /api/managers/invite-info?token=xxx` | 직접 Firestore 조회 | 인증 불필요 (공개) |

**적용 파일 (datapage-main):**
- `pages/api/managers/invite.js` — 초대 생성 프록시 (마스터 JWT → x-internal-key 변환)
- `pages/api/managers/invite-accept.js` — 초대 수락 프록시 (매니저 세션 확인 → sessionId 전달)
- `pages/api/managers/invite-info.js` — 초대 정보 조회 (매장명, 초대자 이름 반환, Firestore 직접 조회)

#### 포탈 프론트엔드 UI

**초대 수락 페이지 (`pages/invite.jsx`) — 완료:**

URL: `https://app.yamoo.ai.kr/invite?token=inv_xxx`

상태 머신:
```
loading → (초대 정보 로드 + 인증 확인)
  ├─ 초대 무효/만료 → 홈으로 리다이렉트
  ├─ login-required → 로그인/회원가입 버튼 표시
  └─ ready → "참여하기" 버튼 표시
       └─ accepting → (API 호출 중)
            ├─ success → "초대 수락 완료" + 2초 후 홈으로 이동
            └─ error → 에러 메시지 표시
```

- 초대 정보 로드 시 `invite-info` API로 매장명, 초대자 이름 표시
- 비로그인 시 "매니저 로그인" / "회원가입" 버튼 표시, 클릭 시 `sessionStorage`에 `inviteRedirect` 저장 후 로그인 페이지로 이동
- 로그인 완료 후 `inviteRedirect`가 있으면 초대 페이지로 자동 복귀
- 수락 완료 시 `window.location.href = '/'`로 전체 새로고침 (세션 갱신)

**초대 모달 (`components/mypage/ManagerSection.tsx` > `InviteModal`) — 완료:**

포탈 마이페이지의 매니저 관리 섹션에서 "매니저 초대" 버튼 클릭 시 표시 (마스터만):

1. 매장 체크박스 목록 (소유 매장 전체 표시)
2. 매장별 권한 설정 (PERMISSION_SECTIONS 기반, 각각 hidden/read/write 선택)
3. "초대 링크 생성" 클릭 → `/api/managers/invite` 호출
4. 생성된 링크 표시 + 클립보드 복사 버튼
5. 링크 형식: `https://app.yamoo.ai.kr/invite?token=inv_xxx` (7일 만료)

**매니저 목록/내보내기 (`ManagerSection.tsx`) — 완료:**

- 매니저 목록에서 매장별 권한 인라인 수정 가능 (hidden/read/write 토글)
- "내보내기" 버튼으로 매니저를 특정 매장에서 제거
- 어드민 생성 관리자(`createdByAdmin: true`)는 내보내기 불가 (API에서 403 반환)

### 10. 어드민 매니저(ad_) 포탈 접근 권한 수정 (부분 완료)

현재 어드민 생성 매니저(ad_)는 `masterEmail: null`이라 포탈에서 데이터가 제대로 안 보임.

**완료:**
- [x] 관리자 판별: `adminId` 필드 존재 여부로 `type: 'admin'` 설정
- [x] UI에서 관리자/매니저 역할 구분 표시 (색상 포함)
- [x] 관리자 계정 이름 수정 차단
- [x] 관리자 계정 비밀번호 변경 차단
- [x] 관리자 접속 시 마스터 이메일 비노출

**미완료:**
- [ ] 매니저 목록 조회: `masterEmail` → `tenantIds` 기반으로 변경
- [ ] 결제/구독/플랜 변경 등 민감 정보는 어드민 매니저 접근 차단 (`ad_` prefix 체크)
- [ ] `settings.email` 조건 완화 (어드민 매니저는 email 없을 수 있음)

**권한 원칙:**
| 영역 | 마스터 | 일반 매니저 | 관리자(adminId 있음) |
|------|--------|-----------|-----------------|
| 대화/데이터/통계 | O | 권한에 따라 | O (전체) |
| 매니저 목록 조회 | O | accounts 권한 | O |
| 매니저 초대/내보내기 | O | X | X |
| 결제/구독/플랜 관리 | O | X | X (차단) |
| 이름 수정 | O | 본인만 | X (차단) |
| 비밀번호 변경 | O | 본인만 | X (차단) |

---

## 대시보드 변경사항

### 1. 로그인

**영향 없음.** 대시보드 로그인은 `loginId` + `passwordHash`를 직접 사용하므로 변경 불필요.
로그인 시 `dashboard_manager_links`에 link가 있으면 로그인 허용, 없으면 차단 (기존 동작 유지).

### 2. /api/accounts/staff GET 변경

기존: `masterEmail`로 매니저 조회
변경: `tenantIds` 기반으로 변경

```typescript
// 기존 (src/app/api/accounts/staff/route.ts)
const snapshot = await db.collection('users_managers')
  .where('masterEmail', '==', masterEmail)
  .get();

// 변경: tenantIds로 조회
const snapshot = await db.collection('users_managers')
  .where('tenantIds', 'array-contains-any', [tenantId])
  .get();
```

### 3. dashboard_manager_links & 대시보드 권한

**자동 link 흐름 (yamoo-payment에서 관리):**
- 초대 수락 시 → 해당 tenantId의 `dashboard_stores`에 매장이 있으면 `dashboard_manager_links` 자동 생성
  - 기본 권한: `staffPermissions: {}` (모든 페이지 `none` = 접근 차단)
- 초대 해제 시 → 자동 삭제
- 계정 삭제 시 → 전체 삭제

**대시보드 owner가 할 일:**
- 매니저가 초대 수락하면 대시보드에 자동으로 나타남 (link 생성됨)
- owner가 accounts 페이지에서 해당 매니저의 페이지별 권한 설정 (`none` → `viewer`/`editor`)
- 전체 뷰어/전체 편집자 버튼으로 일괄 변경 가능

**타이밍 이슈 처리:**
- 대시보드 미개설 상태에서 초대 수락 → link 미생성
- 이후 대시보드 개설 시 → 기존 매니저에 대해 link 자동 생성 필요 (대시보드 개설 로직에 추가)

**페이지별 권한 (`staffPermissions`):**
| 권한 | 설명 |
|------|------|
| `none` | 접근 차단 (기본값) |
| `viewer` | 조회만 |
| `editor` | 편집 가능 |

### 4. 대시보드 변경 작업 목록

- [ ] `/api/accounts/staff` GET: `masterEmail` 조회 → `tenantIds` `array-contains-any` 조회로 변경
- [ ] 대시보드 개설 시 기존 매니저 link 자동 생성 로직 추가
- [ ] 기존 link/unlink/권한 수정 UI는 그대로 유지

**관련 파일 (대시보드):**
| 파일 | 역할 |
|------|------|
| `src/app/api/auth/login/route.ts` | 로그인 시 `dashboard_manager_links` 확인 |
| `src/app/api/accounts/staff/route.ts` | 매니저 조회/link/unlink/권한 수정 (**masterEmail → tenantIds 변경 필요**) |
| `src/lib/firestore/manager-links.ts` | `dashboard_manager_links` CRUD |
| `src/lib/page-permissions.ts` | 페이지별 권한 정의 |
| `src/hooks/usePagePermission.ts` | 프론트 권한 체크 |

---

## API 전체 목록

### 신규 API
| API | 메서드 | 설명 |
|-----|--------|------|
| /api/auth/manager-register | POST | 매니저 자체 회원가입 (포탈만) |
| /api/auth/manager-find-id | POST | 매니저 아이디 찾기 (이름+전화번호+SMS인증) |
| /api/auth/manager-reset-password | POST | 매니저 비밀번호 재설정 (아이디+이름+전화번호+SMS인증) |
| /api/auth/manager-profile | PATCH | 매니저 본인 프로필 수정 |
| /api/auth/manager-account | DELETE | 매니저 본인 계정 삭제 |
| /api/managers/search | GET | loginId로 매니저 검색 |
| /api/managers/invite | POST | 초대 링크 생성 |
| /api/managers/invite/accept | POST | 초대 수락 |
| /api/managers/{id}/tenants/{tenantId} | PATCH | 권한 수정 |
| /api/managers/{id}/tenants/{tenantId} | DELETE | 초대 해제 |
| /api/auth/manager-link | POST | 매니저-마스터 계정 연동 |
| /api/auth/manager-link | DELETE | 계정 연동 해제 |

### 수정된 API (masterEmail 제거)
| API | 변경 |
|-----|------|
| POST /api/auth/manager-login | 응답에서 masterEmail 제거 |
| GET /api/auth/manager-session | 응답에서 masterEmail 제거 |
| POST /api/auth/manager-billing-token | JWT에서 masterEmail 제거 |
| GET /api/auth/manager-sso | 세션 생성 시 masterEmail 제거 |
| POST /api/auth/sms-verify | 매니저용 purpose 추가 (manager-signup/find-id/reset-password) |
| GET /api/managers | getMasterTenantIds + getManagersByTenantIds 사용 |
| GET /api/managers/{id} | tenantIds 겹침 체크 |

### 제거된 API/기능
| API | 설명 |
|-----|------|
| POST /api/managers | registerManager API로 대체 |
| PATCH /api/managers/{id} | 분리된 API로 대체 (profile, tenants) |
| DELETE /api/managers/{id} | 계정삭제/내보내기로 분리 |

---

## 서버 간 인증 (INTERNAL_API_KEY)

포탈에서 yamoo-payment API를 프록시 호출할 때 서버 간 인증이 필요한 API:

| API | 인증 방식 |
|-----|----------|
| POST /api/managers/invite | 쿠키(`auth_session`) 또는 `x-internal-key` + `x-master-email` 헤더 |

**설정:**
- yamoo-payment `.env.local`: `INTERNAL_API_KEY=<랜덤 시크릿>`
- 포탈 `.env.local`: `INTERNAL_API_KEY=<동일한 시크릿>`

**포탈 프록시 호출 시:**
```javascript
await fetch(`${PAYMENT_API}/api/managers/invite`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-master-email': email,
    'x-internal-key': process.env.INTERNAL_API_KEY,
  },
  body: JSON.stringify(req.body),
});
```

---

## 약관 동의 기록

회원가입 시 `agreedToTermsAt` 필드가 자동 저장됨:

| 대상 | 컬렉션 | 필드 |
|------|--------|------|
| 마스터 | `users` | `agreedToTermsAt: Date` |
| 매니저 | `users_managers` | `agreedToTermsAt: Date` |

> 재가입 시 마스터는 최초 동의 시각 유지 (`existingData?.agreedToTermsAt || now`).

---

## 마이그레이션

- 기존 `masterEmail` 필드: DB에 잔류 (코드에서 안 씀)
- 기존 매니저: `tenantIds` 이미 있으므로 조회 정상
- 기존 매니저 비밀번호: 본인 프로필 수정 API로 변경 가능하도록 안내
