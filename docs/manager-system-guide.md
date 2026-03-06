# 매니저 시스템 리디자인 - 포탈/대시보드 가이드

## 변경 요약

기존 `masterEmail` 기반 소속 모델에서 **독립 계정 + 초대 모델**로 변경됨.

### 핵심 변경사항
- 매니저는 자체 회원가입 (포탈에서만)
- 마스터는 매장/권한 선택 후 초대 링크 생성 → 매니저에게 전달
- `masterEmail` 필드 제거 → `tenantId` 기반 조회
- 소유자 이전 시 매니저 자동 승계 (별도 처리 불필요)
- 계정 관리: 매니저 본인만 (비밀번호/이름)
- 계정 삭제: 본인 + 어드민만
- 마스터는 자기 매장에서 매니저 내보내기만 가능 (어드민이 생성한 관리자 계정은 내보내기 불가)

---

## 포탈 (datapage-main) 변경사항

### 1. 매니저 로그인 응답 변경

**기존:**
```json
{
  "managerId": "mg_xxx",
  "loginId": "cafe_staff01",
  "masterEmail": "owner@example.com",
  "tenants": [...],
  "sessionId": "ms_xxx"
}
```

**변경:**
```json
{
  "managerId": "mg_xxx",
  "loginId": "cafe_staff01",
  "tenants": [...],
  "sessionId": "ms_xxx"
}
```

→ `masterEmail` 필드 삭제됨. `session.masterEmail` 참조하는 코드 모두 제거 필요.

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

### 2. 세션 조회 응답 변경 (GET /api/auth/manager-session)

`masterEmail` 필드 삭제됨.

### 3. getAuthorizedEmail() 변경 필요

기존: `session.masterEmail`로 마스터 이메일 조회
변경: tenant에서 마스터 이메일 조회로 변경

```typescript
// 기존
const email = session.masterEmail;

// 변경: tenants의 첫 번째 tenantId로 tenants 컬렉션에서 email 조회
// 또는 API 호출로 해결
```

### 4. 매니저 회원가입 페이지 (신규, 포탈에서만)

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

### 4-1. 아이디 찾기 (포탈)

`POST /api/auth/manager-find-id`
```json
{ "name": "홍길동", "phone": "010-0000-0000", "phoneVerified": true }
```
응답: `{ "accounts": [{ "maskedLoginId": "ca********" }] }`

### 4-2. 비밀번호 재설정 (포탈)

`POST /api/auth/manager-reset-password`
```json
{ "loginId": "cafe_staff01", "name": "홍길동", "phone": "010-0000-0000", "newPassword": "New!pass1", "phoneVerified": true }
```

#### 약관/개인정보처리방침 연동

포탈 회원가입 페이지에서 `GET /api/terms` (yamoo-payment API)를 호출하여 홈페이지와 동일한 약관을 표시합니다.

- **API**: `GET /api/terms` → `termsOfService`, `privacyPolicy` 필드 사용 (홈페이지와 동일한 배포 약관)
- **이용약관**: 제2조에서 매니저를 "이용자"에 포함
- **개인정보처리방침**: 수집방법에 "포탈(매니저 회원가입)" 반영 필요

### 5. 매니저 프로필 수정 페이지 (신규)

`PATCH /api/auth/manager-profile?sessionId=ms_xxx`
```json
{
  "name": "새이름",
  "phone": "010-1234-5678",
  "password": "NewPass!456"  // 선택
}
```

### 6. 매니저 관리 UI 변경

기존: "매니저 추가" → 계정 생성 폼
변경: "매니저 초대" → 매장 선택 + 권한 설정 → 초대 링크 생성

초대 흐름:
1. 마스터가 홈페이지 마이페이지에서 "매니저 초대" 클릭
2. 초대할 매장 선택 + 매장별 권한 설정
3. "초대 링크 생성" 클릭
4. 생성된 링크를 매니저에게 전달 (클립보드 자동 복사) (7일 만료)
5. 매니저가 포탈(`https://app.yamoo.ai.kr/invite?token=xxx`)에서 수락

> **참고:** 초대 링크는 포탈 도메인(app.yamoo.ai.kr)으로 생성됩니다. 포탈에서 `/invite` 페이지 구현이 필요합니다.

- 초대 API: `POST /api/managers/invite`
- 초대 해제: `DELETE /api/managers/{id}/tenants/{tenantId}`
- 권한 수정: `PATCH /api/managers/{id}/tenants/{tenantId}`

### 7. 초대 수락 (신규)

`POST /api/managers/invite/accept`
```json
{
  "inviteToken": "inv_xxx...",
  "sessionId": "ms_xxx"
}
```

매니저가 포탈(app.yamoo.ai.kr)에서 로그인 후 초대 링크를 통해 수락.
포탈에서 `/invite` 페이지 구현 필요 (토큰 검증 → 매니저 로그인 → 수락 API 호출).

**수락 후 리다이렉트:** 수락 완료 시 해당 매장 채널 페이지로 자동 이동 (예: `/store/{tenantId}`)

### 8. 어드민 매니저(ad_) 포탈 접근 권한 수정

현재 어드민 생성 매니저(ad_)는 `masterEmail: null`이라 포탈에서 데이터가 제대로 안 보임.

**문제:**
- 매니저 목록 API가 `masterEmail` 기준 조회 → ad_ 매니저는 결과 없음
- `accounts: hidden`이면 ManagerSection 통째로 안 보임
- 결제/구독 차단 로직 없이 전체가 안 보이는 상태

**수정 방향:**
- [ ] 매니저 목록 조회: `masterEmail` → `tenantIds` 기반으로 변경
- [ ] 어드민 매니저도 매장 운영 관련 페이지 접근 가능하게 (대화, 데이터, 통계, 매니저 목록)
- [ ] 결제/구독/플랜 변경 등 민감 정보는 어드민 매니저 접근 차단 (`ad_` prefix 체크)
- [ ] `settings.email` 조건 완화 (어드민 매니저는 email 없을 수 있음)

**권한 원칙:**
| 영역 | 마스터 | 일반 매니저 | 어드민 매니저(ad_) |
|------|--------|-----------|-----------------|
| 대화/데이터/통계 | O | 권한에 따라 | O (전체) |
| 매니저 목록 조회 | O | accounts 권한 | O |
| 매니저 초대/내보내기 | O | X | X |
| 결제/구독/플랜 관리 | O | X | X (차단) |
| 계정 정보 수정 | O | 본인만 | X |

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
