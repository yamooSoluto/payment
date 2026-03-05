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
- 마스터는 자기 매장에서 초대 해제만 가능

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
  "phone": "010-0000-0000"  // 선택
}
```

> **참고:** 매니저 회원가입은 포탈에서만 가능합니다. 대시보드에서는 회원가입 불가.

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
4. 생성된 링크를 매니저에게 전달 (클립보드 자동 복사)
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

---

## 대시보드 변경사항

### 1. 로그인

**영향 없음.** 대시보드 로그인은 `loginId` + `passwordHash`를 직접 사용하므로 변경 불필요.

### 2. /api/accounts/staff GET 변경

기존: `masterEmail`로 매니저 조회
변경: `tenantId` 기반으로 변경

```typescript
// 기존
const managers = await db.collection('users_managers')
  .where('masterEmail', '==', masterEmail)
  .get();

// 변경: tenantIds로 조회
const managers = await db.collection('users_managers')
  .where('tenantIds', 'array-contains-any', [tenantId])
  .get();
```

### 3. dashboard_manager_links

yamoo-payment에서 자동 관리됨:
- 초대 수락 시 → 해당 tenantId의 dashboard_stores에 매장이 있으면 자동 생성
- 초대 해제 시 → 자동 삭제
- 계정 삭제 시 → 전체 삭제

대시보드에서 수동 link/unlink 로직은 선택적 유지.

---

## API 전체 목록

### 신규 API
| API | 메서드 | 설명 |
|-----|--------|------|
| /api/auth/manager-register | POST | 매니저 자체 회원가입 (포탈만) |
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
| GET /api/managers | getMasterTenantIds + getManagersByTenantIds 사용 |
| GET /api/managers/{id} | tenantIds 겹침 체크 |

### 제거된 API/기능
| API | 설명 |
|-----|------|
| POST /api/managers | registerManager API로 대체 |
| PATCH /api/managers/{id} | 분리된 API로 대체 (profile, tenants) |
| DELETE /api/managers/{id} | 계정삭제/초대해제로 분리 |

---

## 마이그레이션

- 기존 `masterEmail` 필드: DB에 잔류 (코드에서 안 씀)
- 기존 매니저: `tenantIds` 이미 있으므로 조회 정상
- 기존 매니저 비밀번호: 본인 프로필 수정 API로 변경 가능하도록 안내
