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

## 마이그레이션

- 기존 `masterEmail` 필드: DB에 잔류 (코드에서 안 씀)
- 기존 매니저: `tenantIds` 이미 있으므로 조회 정상
- 기존 매니저 비밀번호: 본인 프로필 수정 API로 변경 가능하도록 안내
