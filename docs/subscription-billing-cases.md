# 구독 결제 시스템 케이스 정리

구독 결제 시스템 구현 시 고려해야 할 모든 시나리오와 엣지 케이스를 정리한 문서입니다.

## 목차
1. [기본 구독 시나리오](#1-기본-구독-시나리오)
2. [플랜 변경 시나리오](#2-플랜-변경-시나리오)
3. [구독 해지 시나리오](#3-구독-해지-시나리오)
4. [결제 실패 처리](#4-결제-실패-처리)
5. [엣지 케이스](#5-엣지-케이스)
6. [매장 삭제 / 회원 탈퇴](#6-매장-삭제--회원-탈퇴)
7. [현재 구현 상태](#7-현재-구현-상태)
8. [Vercel Cron Job 상세](#8-vercel-cron-job-상세)
9. [Firestore 컬렉션 구조](#9-firestore-컬렉션-구조)
10. [알림 이력 관리 시스템 (TODO)](#10-알림-이력-관리-시스템-todo)
11. [참고 자료](#11-참고-자료)
12. [다음 구현 우선순위](#12-다음-구현-우선순위)

---

## 1. 기본 구독 시나리오

### 1.1 무료 체험 시작
- **케이스**: 신규 사용자가 무료 체험 신청
- **처리**:
  - 카드 정보 등록 **없이** 체험 시작
  - 체험 기간 설정 (예: 1달)
  - 구독 상태: `trial`
  - 체험 종료일 저장
  - 빌링키는 나중에 유료 전환 시점에 등록
- **구현 상태**: ✅ 완료

### 1.2 무료 체험 → 유료 전환 (사용자 선택)
- **케이스**: 사용자가 체험 중 유료 전환 결정
- **처리 (즉시 전환)**:
  - 카드 정보 입력 → 빌링키 발급
  - 선택한 플랜으로 즉시 결제
  - 구독 상태: `trial` → `active`
  - `currentPeriodStart` = 오늘
- **처리 (예약 전환)**:
  - 카드 정보 입력 → 빌링키 발급
  - `pendingPlan`, `pendingAmount` 저장
  - 체험 종료일에 자동 결제 + 구독 활성화
- **구현 상태**: ✅ 완료

### 1.3 무료 체험 기간 만료
- **케이스**: 사용자가 유료 전환하지 않고 체험 기간 종료
- **처리**:
  - 빌링키가 없으므로 자동 전환 불가
  - 구독 상태: `trial` → `expired`
  - 서비스 이용 중단
  - 데이터는 90일간 보관
- **구현 상태**: ✅ 완료

#### 1.3.1 무료 체험 중 예약 후 취소
- **케이스**: 플랜 예약했다가 취소 후 체험 기간 만료
- **처리**:
  - 빌링키는 등록되어 있음 (예약 시 등록됨)
  - `pendingPlan` = null (취소로 인해 삭제됨)
  - 체험 종료 시 `pendingPlan`이 없으므로 자동 결제 시도 안 함
  - 구독 상태: `trial` → `expired`
  - 서비스 이용 중단
  - 데이터는 90일간 보관
  - 등록된 빌링키는 유지되어 나중에 재구독 시 재사용 가능
- **구현 상태**: ✅ 완료

### 1.4 정기 결제
- **케이스**: 매월 결제일에 자동 결제
- **처리**:
  - 빌링키로 자동 결제 시도
  - 성공: `currentPeriodStart`, `currentPeriodEnd` 업데이트, payments 컬렉션에 결제 내역 저장
  - 실패: Dunning 프로세스 시작 (3회 재시도)
- **자동화**:
  - Vercel Cron Job으로 매일 00:00 KST 실행
  - N8N 웹훅으로 결제 성공/실패 알림 전송
  - tenants 컬렉션 자동 동기화
- **구현 상태**: ✅ 완료

---

## 2. 플랜 변경 시나리오

### 2.1 플랜 정보
| 플랜 | 월 가격 (VAT 포함) |
|------|-------------------|
| Trial | 0원 |
| Basic | 39,000원 |
| Business | 99,000원 |

### 2.2 업그레이드 (즉시)
- **케이스**: Basic → Business 플랜 변경
- **계산 로직** (기존 플랜 부분 환불 + 새 플랜 결제 분리):
  ```
  남은 일수 = currentPeriodEnd - 오늘
  총 일수 = currentPeriodEnd - currentPeriodStart

  기존 플랜 환불액 = (현재 플랜 가격 / 총 일수) × 남은 일수
  새 플랜 결제액 = (새 플랜 가격 / 총 일수) × (남은 일수 + 1)
  ```
- **처리**:
  1. 기존 플랜 부분 환불 (Toss cancelPayment)
  2. 새 플랜 일할 결제 (Toss 빌링키 결제)
  3. `plan`, `amount` 즉시 변경
  4. `previousPlan`, `previousAmount` 저장
  5. payments 컬렉션에 환불/결제 내역 저장
  6. tenants 컬렉션 동기화
- **구현 상태**: ✅ 완료

### 2.3 다운그레이드 (즉시)
- **케이스**: Business → Basic 플랜 변경
- **계산 로직**:
  ```
  환불 금액 = 기존 플랜 환불액 - 새 플랜 결제액
  ```
- **처리**:
  - Toss Payments API로 부분 환불 요청
  - `plan`, `amount` 즉시 변경
  - payments 컬렉션에 환불 내역 저장 (`type: 'downgrade_refund'`)
  - `originalPaymentId` 연결
  - refunds 컬렉션에도 환불 내역 저장
- **구현 상태**: ✅ 완료

### 2.4 플랜 변경 예약 (다음 결제일부터 적용)
- **케이스**: 사용자가 즉시 변경이 아닌 예약 선택
- **처리**:
  - `pendingPlan`, `pendingAmount`, `pendingMode` 필드에 저장
  - `pendingChangeAt` = nextBillingDate
  - 현재 구독은 그대로 유지
  - 다음 결제일에 자동으로 플랜 변경 + 새 금액 결제
- **구현 상태**: ✅ 완료

### 2.5 엣지 케이스: 결제 주기 마지막 날 변경
- **케이스**: currentPeriodEnd - 1일에 플랜 변경
- **문제점**: 남은 일수가 0일 또는 1일
- **처리**:
  - 남은 일수 0일: 새 플랜 1일치만 결제 (daysLeft + 1 = 1일)
  - 업그레이드: 새 플랜 1일치 결제
  - 다운그레이드: 환불 없이 플랜만 변경
  - 토스 최소 결제액(100원)은 플랜 가격(39,000원~)으로 인해 문제없음
- **구현 상태**: ✅ 구현됨

### 2.6 엣지 케이스: 결제 주기 첫날 변경
- **케이스**: 방금 결제하고 바로 플랜 변경
- **계산 로직** (30일 기준):
  - 현재 플랜: 1일 사용으로 간주, 29일치 환불
  - 새 플랜: 전체 기간(30일) 결제
  - 실제 차액: `새 플랜 30일치 - 현재 플랜 29일치`
- **처리**:
  - 사용자가 1일 이용료만 지불하고 플랜 변경 가능
  - 공정한 계산으로 손해 없이 변경 가능
- **구현 상태**: ✅ 완료

---

## 3. 구독 해지 시나리오

### 3.1 기간 종료 후 해지 (Scheduled)
- **케이스**: 사용자가 해지 신청, 현재 기간은 유지
- **처리**:
  - 구독 상태: `canceled`
  - `canceledAt`, `cancelReason`, `cancelMode: 'scheduled'` 저장
  - `currentPeriodEnd`까지 서비스 이용 가능
  - 다음 자동 결제 중단
- **구현 상태**: ✅ 완료

### 3.2 즉시 해지 (Immediate)
- **케이스**: 사용자가 즉시 해지 + 환불 요청
- **계산 로직**:
  ```
  남은 일수 = currentPeriodEnd - 오늘
  환불 금액 = (결제 금액 / 총 일수) × 남은 일수
  ```
- **처리**:
  - Toss Payments API로 부분 환불
  - 구독 상태: `expired`
  - `expiredAt` = 오늘
  - `currentPeriodEnd` = 오늘 (실제 종료일 업데이트)
  - 즉시 서비스 이용 중단
  - payments 컬렉션에 환불 내역 저장 (`type: 'cancel_refund'`)
  - refunds 컬렉션에 환불 내역 저장
- **구현 상태**: ✅ 완료

### 3.3 해지 취소 (구독 재활성화)
- **케이스**: 해지 예약 후 마음 변경
- **조건**: `status === 'canceled'` AND `currentPeriodEnd > 오늘`
- **처리**:
  - 구독 상태: `canceled` → `active`
  - `canceledAt`, `cancelReason` = null
  - `reactivatedAt` = 오늘
  - tenants 컬렉션 동기화 (`syncSubscriptionReactivation`)
- **API**: `POST /api/subscriptions/reactivate`
- **구현 상태**: ✅ 완료

### 3.4 환불 계산 엣지 케이스
#### 3.4.1 플랜 변경 후 즉시 해지
- **문제**: 플랜 변경으로 일할 계산된 금액으로 결제했는데, `subscription.amount`에는 정가가 저장됨
- **해결**: `currentPeriodStart`를 플랜 변경일로 업데이트하여 정확한 기간 계산
- **구현 상태**: ✅ 완료

#### 3.4.2 마지막 날 즉시 해지
- **케이스**: 결제 주기 마지막 날 즉시 해지
- **처리**: 환불액 = 0원
- **구현 상태**: ✅ 로직상 처리됨

#### 3.4.3 결제 직후 즉시 해지
- **케이스**: 결제하고 몇 분 내로 즉시 해지
- **처리**: 거의 전액 환불
- **구현 상태**: ✅ 로직상 처리됨

---

## 4. 결제 실패 처리

### 4.1 Soft Decline (일시적 실패)
- **원인**: 잔액 부족, 일시적 네트워크 오류, 카드사 시스템 점검
- **처리** (Dunning):
  1. **D+0 (1일차, 1회차 실패)**:
     - `status = 'past_due'` (즉시 변경)
     - `retryCount = 1`
     - `gracePeriodUntil = D+6` 설정 (7일간 유예)
     - N8N: `payment_retry_1` 이벤트 전송
  2. **D+1 (2일차, 2회차 실패)**:
     - `status = 'past_due'` 유지
     - `retryCount = 2`
     - N8N: `payment_retry_2` 이벤트 전송
  3. **D+2 (3일차, 3회차 실패)**:
     - `status = 'past_due'` 유지
     - `retryCount = 3`
     - N8N: `payment_failed_grace_period` 이벤트 전송
  4. **D+3 ~ D+6 (4~7일차, 유예 기간)**:
     - 서비스 계속 이용 가능 (`status = 'past_due'`)
     - 카드 업데이트 시 자동 재결제 시도
  5. **D+7 (8일차, 유예 기간 만료)**:
     - `status = 'suspended'` (서비스 중단)
     - tenants 동기화: `syncSubscriptionSuspended()`
     - N8N: `grace_period_expired` 이벤트 전송
- **고객 알림** (N8N 웹훅):
  - 1~2회 실패: `payment_retry_1`, `payment_retry_2`
  - 3회 실패: `payment_failed_grace_period`
  - 유예 기간 만료: `grace_period_expired`
- **구현 상태**: ✅ 완료 (Vercel Cron, 웹훅 발송), ⏳ N8N 워크플로우 미설정

### 4.2 카드 업데이트 시 자동 재결제
- **케이스**: 결제 실패 상태(`past_due`)에서 카드 변경
- **처리**:
  - 새 카드로 즉시 재결제 시도
  - 성공 시:
    - `status = 'active'` 복구
    - `retryCount = 0` 초기화
    - `gracePeriodUntil = null` 제거
    - `currentPeriodStart = today`, `nextBillingDate = today + 1개월`
    - payments 저장 (`type: 'card_update_retry'`)
    - N8N: `card_update_retry_success` 이벤트 전송
  - 실패 시: 다음 정기 재시도 일정에 따라 진행
- **구현 상태**: ✅ 완료

### 4.3 유예 기간 (Grace Period)
- **정의**: 결제 1회 실패부터 7일간 서비스 이용 가능
- **기간**: 7일 (D+0 ~ D+6, 총 7일)
- **상태**: `status = 'past_due'` + `gracePeriodUntil = D+6` 설정
- **처리**:
  - 1회 실패 시 유예 기간 시작
  - D+0, D+1, D+2에 재시도 (3회)
  - D+7 (8일차)에 유예 기간 만료 시 `status = 'suspended'`로 변경
  - 유예 기간 중 서비스는 계속 이용 가능
  - UI에 경고 배너 표시 (권장)
  - 카드 업데이트 시 자동 재결제
- **구현 상태**: ✅ 완료

---

## 5. 엣지 케이스

### 5.1 동시성 문제
#### 5.1.1 플랜 변경 + 해지 동시 클릭
- **문제**: 같은 시간에 두 요청이 들어옴
- **해결책**:
  - DB 트랜잭션 사용 (현재 구현됨)
  - Optimistic Locking: `subscription` 문서에 `version` 필드 추가
  ```typescript
  transaction.update(subscriptionRef, {
    version: currentVersion + 1,
    ...otherFields
  });
  // version이 맞지 않으면 트랜잭션 실패
  ```
- **구현 상태**: ⚠️ 트랜잭션만 있음

#### 5.1.2 중복 결제 요청
- **문제**: 네트워크 타임아웃 → 사용자가 재시도 버튼 클릭 → 중복 결제
- **해결책**: 멱등성 키(Idempotency Key) 사용
  ```typescript
  const idempotencyKey = `${tenantId}_${timestamp}`;
  // 이미 처리된 요청인지 확인
  const existingPayment = await db.collection('payments')
    .where('idempotencyKey', '==', idempotencyKey)
    .limit(1)
    .get();
  if (!existingPayment.empty) {
    return existingPayment.docs[0].data();
  }
  ```
- **구현 상태**: ❌ 미구현

### 5.2 Toss Payments와 DB 상태 불일치
#### 5.2.1 Toss 결제 성공 → DB 저장 실패
- **문제**: 네트워크 오류로 DB 업데이트 실패
- **해결책**: Webhook으로 Toss에서 결제 완료 알림 수신 시 재처리
- **구현 상태**: ✅ Webhook 구현됨

#### 5.2.2 Toss 환불 성공 → DB 업데이트 실패
- **문제**: 환불은 됐는데 DB에는 반영 안 됨
- **해결책**:
  - Webhook에서 환불 알림 수신
  - 수동 관리자 도구로 동기화
- **구현 상태**: ⚠️ Webhook 있지만 환불 처리 확인 필요

### 5.3 날짜/시간 경계 케이스
#### 5.3.1 월말 → 다음 달 처리
- **예시**: 1월 31일 구독 → 2월 결제일은?
  - Option 1: 2월 28일 (달마다 다름)
  - Option 2: 매월 마지막 날
  - Option 3: 다음 달 1일
- **현재 구현**: 월 단위로 +1개월 (JavaScript `setMonth`)
- **구현 상태**: ✅ 구현됨

#### 5.3.2 시간대 (Timezone) 처리
- **문제**: 서버 시간(UTC) vs 사용자 시간대 (KST)
- **해결책**: 모든 시간을 UTC로 저장, 표시만 사용자 시간대
- **구현 상태**: ⚠️ 확인 필요

#### 5.3.3 일광 절약 시간 (DST)
- **문제**: 특정 국가에서 시간이 1시간 변경
- **해결책**: UTC 기준으로 저장
- **구현 상태**: N/A (한국은 DST 없음)

### 5.4 환불 금액 계산 오류
#### 5.4.1 소수점 반올림 오류
- **문제**: 일할 계산 시 소수점 누적 오류
- **예시**:
  ```
  39,000원 / 30일 = 1,300원/일
  1,300원 × 29일 = 37,700원
  실제 환불: 37,700원 (정확함)

  하지만 float 계산 시:
  (39000 / 30) * 29 = 37,699.999...
  Math.round() = 37,700 ✅
  Math.floor() = 37,699 ❌ (100원 손해)
  ```
- **해결책**: 항상 `Math.round()` 또는 `Math.floor()` 일관되게 사용
- **구현 상태**: ✅ `Math.round()` 사용 중

#### 5.4.2 음수 환불 금액
- **케이스**: 계산 오류로 환불액이 음수
- **해결책**: `Math.max(0, refundAmount)` 체크
- **구현 상태**: ⚠️ 체크 없음

### 5.5 결제 수단 변경
#### 5.5.1 구독 중 카드 변경
- **처리**:
  - 새 카드로 빌링키 발급
  - 기존 빌링키 비활성화
  - 다음 결제부터 새 카드 사용
- **구현 상태**: ✅ 완료

#### 5.5.2 카드 만료 전 갱신
- **처리**:
  - 만료 30일 전, 7일 전 N8N 웹훅 알림 (`card_expiring_soon`)
  - 사용자에게 카드 갱신 안내
- **구현 상태**: ✅ 완료 (Vercel Cron + N8N)

### 5.6 세금/VAT 처리
- **적용 범위**: 한국 시장 전용 (국제 결제 없음)
- **세금율**: 10% VAT (부가가치세)
- **가격 표시**: 모든 금액은 VAT 포함 가격
  - Basic 플랜: 39,000원/월 (VAT 포함)
  - Business 플랜: 99,000원/월 (VAT 포함)
- **세금 변경**: 필요 없음 (고정 세율)
- **구현 상태**: ✅ 완료 (Toss Payments 자동 처리)

### 5.7 쿠폰/프로모션 코드
#### 5.7.1 첫 달 50% 할인
- **처리**:
  - `discountAmount` 필드 추가
  - 첫 결제만 할인 적용
  - 두 번째 결제부터 정상 금액
- **구현 상태**: ❌ 미구현 (구현 계획 아직 없음)

#### 5.7.2 연간 구독 할인
- **처리**:
  - 12개월 금액의 80%로 연간 결제
  - `billingCycle: 'yearly'`
- **구현 상태**: ❌ 미구현 (구현 계획 아직 없음)

### 5.8 가격 정책 (Price Policy)
- **타입**: `grandfathered` | `protected_until` | `standard`
- **설명**:
  - `grandfathered`: 가격 보호 (영구) - 기존 가격 평생 유지
  - `protected_until`: 기간 한정 가격 보호 - 특정 날짜까지 기존 가격 유지
  - `standard`: 일반 (최신 가격 적용)
- **구현 상태**: ✅ 완료 (`lib/toss.ts`)

---

## 6. 매장 삭제 / 회원 탈퇴

### 6.1 매장 삭제 (Tenant Deletion)

**API**: `DELETE /api/tenants/[tenantId]` (사용자) / `DELETE /api/admin/tenants/[tenantId]` (관리자)

#### 삭제 조건
- 구독 상태가 `expired`이거나 구독이 없는 경우만 삭제 가능
- 삭제 불가 상태: `trial`, `active`, `canceled`, `past_due`

#### 처리 방식: **Soft Delete**

**tenants 컬렉션 업데이트:**
```typescript
{
  deleted: true,
  deletedAt: Date,
  deletedBy: email | 'admin',
  permanentDeleteAt: Date, // 90일 후
  updatedAt: serverTimestamp
}
```

**tenant_deletions 컬렉션 추가 (로그):**
```typescript
{
  tenantId: string,
  brandName: string,
  email: string,
  deletedAt: Date,
  permanentDeleteAt: Date, // 90일 후
  reason: 'user_request' | 'admin_delete'
}
```

#### 특징
- 매장 데이터 자체는 삭제하지 않고 `deleted: true` 표시
- `permanentDeleteAt` (90일 후)까지 복구 가능 기간
- 추후 배치 작업으로 `permanentDeleteAt` 지난 데이터 영구 삭제 예정

**구현 상태**: ✅ 완료

---

### 6.2 회원 탈퇴 (Account Deletion)

**API**: `DELETE /api/account/delete`

#### 탈퇴 조건
- 모든 매장이 구독/체험 종료 상태여야 함
- 탈퇴 불가: `active`, `trial`, `canceled` 상태의 구독이 있는 경우

#### 처리 방식: **Soft Delete + 법령 준수 보관**

**1) tenants 컬렉션:**
```typescript
{
  deleted: true,
  deletedAt: Date,
  deletedEmail: '원본 이메일',
  email: 'deleted_{timestamp}_{email}' // 마스킹
}
```

**2) subscriptions 컬렉션:**
```typescript
{
  deleted: true,
  deletedAt: Date
}
```

**3) cards 컬렉션:** **완전 삭제** (카드 정보는 보관 불필요)

**4) users 컬렉션:** (결제 이력에 따라 보관 기간 차등)
```typescript
{
  deleted: true,
  deletedAt: Date,
  retentionEndDate: Date,
  retentionReason: '전자상거래법_5년' | '부정이용방지_1년',
  // email, phone, name, trialApplied 모두 유지
  // - deleted 상태라 신규 가입은 가능
  // - phone으로 무료체험 이력 추적
}
```

| 유형 | 보관 기간 | 근거 |
|------|----------|------|
| 결제 고객 | 5년 | 전자상거래법 |
| 무료체험만 | 1년 | 부정 이용 방지 |

**5) account_deletions 컬렉션 추가 (로그):**
```typescript
{
  email: string,
  tenantIds: string[],
  deletedAt: Date,
  reason: 'User requested deletion'
}
```

**6) N8N 웹훅 호출:** `account_deleted` 이벤트

**구현 상태**: ✅ 완료

---

### 6.3 재가입/복구 관련

| 항목 | 처리 |
|------|------|
| 매장 복구 | `permanentDeleteAt` 이전에 관리자가 `deleted: false`로 변경 |
| 회원 재가입 | `deleted: true`인 이메일로 재가입 가능 (신규 가입 취급) |
| 무료체험 중복 방지 | `phone` 기준으로 `trialApplied` 체크 |

---

## 7. 현재 구현 상태

### ✅ 완료된 기능

#### 구독 관리
1. **무료 체험 시작 및 관리**
   - 카드 등록 없이 체험 시작
   - 빌링키는 유료 전환 시점에 등록
2. **무료 체험 → 유료 전환**
   - 즉시 전환: 카드 등록 + 즉시 결제
   - 예약 전환: `pendingPlan` 저장 → 체험 종료일에 자동 전환
3. **플랜 업그레이드/다운그레이드 (즉시)**
   - 일할 계산 환불/결제 (기존 환불 + 새 결제 분리)
   - `currentPeriodStart` 업데이트로 정확한 환불 계산
   - 트랜잭션 기반 원자성 보장
4. **플랜 변경 예약 (다음 결제일부터)**
   - `pendingPlan`, `pendingAmount`, `pendingMode` 저장
   - Cron Job에서 자동 적용
5. **구독 해지**
   - 예약 해지: `currentPeriodEnd`까지 이용 가능
   - 즉시 해지: 일할 환불 + 즉시 서비스 중단
   - 환불 내역 저장 (`type: 'cancel_refund'`, `originalPaymentId` 연결)
6. **구독 재활성화**
   - 해지 예약 상태에서 재활성화 가능
   - `status: 'canceled' → 'active'`

#### 결제 자동화 (Vercel Cron Job)
7. **정기 결제 자동 처리**
   - 실행 주기: 매일 00:00 KST (`vercel.json`)
   - Firebase Composite Index 설정 완료
   - CRON_SECRET 인증 적용
8. **무료체험 만료 처리**
   - `pendingPlan` 있으면: 자동 전환 + 첫 결제
   - `pendingPlan` 없으면: `status = 'expired'`
9. **카드 만료 사전 알림**
   - 30일 전, 7일 전 알림 전송
10. **예약 플랜 변경 자동 적용**
    - `pendingChangeAt` 도달 시 자동 적용
11. **결제 실패 재시도 (Dunning) 및 유예 기간**
    - D+0, D+1, D+2 재시도 (3회)
    - 1회 실패 시 즉시 `status = 'past_due'` 변경 및 `gracePeriodUntil = D+6` 설정
    - 유예 기간: D+0 ~ D+6 (총 7일)
    - D+7 (8일차)에 유예 기간 만료 시 `status = 'suspended'`
    - 유예 기간 중 서비스 계속 이용 가능
12. **카드 업데이트 시 자동 재결제**
    - `past_due` 상태에서 카드 변경 시 즉시 재결제 시도
    - 성공 시 `status = 'active'` 복구
    - 실패 시 다음 재시도 일정에 따라 진행

#### 데이터 동기화 & 알림
13. **tenants 컬렉션 자동 동기화**
    - `syncNewSubscription`: 무료체험 전환 시
    - `syncTrialExpired`: 체험 만료 시
    - `syncPlanChange`: 플랜 변경 시
    - `syncPaymentSuccess`: 결제 성공 시
    - `syncPaymentFailure`: 결제 실패 시
    - `syncSubscriptionCancellation`: 해지 예약 시
    - `syncSubscriptionReactivation`: 구독 재활성화 시
    - `syncSubscriptionExpired`: 구독 만료 시
    - `syncSubscriptionSuspended`: 유예 기간 만료 시
14. **N8N 웹훅 알림** (⚠️ 현재 알림성 웹훅 비활성화됨)

    **활성화/비활성화 설정**: `lib/n8n.ts`
    ```typescript
    export const ENABLE_N8N_NOTIFICATION_WEBHOOKS = false;  // true로 변경 시 활성화
    ```

    **항상 활성 (tenant/trial 생성용):**
    - `trial/create` - 무료체험 신청 → n8n에서 tenant 생성
    - `trial/apply` - 기존 매장에 체험 적용
    - `tenants/route` - 매장 추가 → n8n에서 tenant 생성

    **비활성화된 알림 웹훅 (ENABLE_N8N_NOTIFICATION_WEBHOOKS로 제어):**
    - `trial_expired`: 무료체험 만료
    - `card_expiring_soon`: 카드 만료 임박 (30일/7일 전)
    - `pending_plan_applied`: 예약 플랜 적용
    - `recurring_payment_success`: 정기결제 성공
    - `payment_retry_1`, `payment_retry_2`: 결제 재시도
    - `payment_failed_grace_period`: 3회 실패 후 유예 기간 시작
    - `grace_period_expired`: 유예 기간 만료
    - `card_update_retry_success`: 카드 변경 후 자동 재결제 성공
    - `plan_changed_immediate`: 즉시 플랜 변경
    - `plan_change_scheduled`: 예약 플랜 변경
    - `subscription_canceled_immediate`: 즉시 해지
    - `subscription_canceled_scheduled`: 예약 해지
    - `account_deleted`: 회원 탈퇴

    **알림 웹훅 활성화 방법:**
    1. N8N에서 각 이벤트 처리 워크플로우 생성
    2. `lib/n8n.ts`에서 `ENABLE_N8N_NOTIFICATION_WEBHOOKS = true` 설정
    3. 환경변수 `N8N_WEBHOOK_URL` 확인
15. **결제 내역 자동 저장**
    - payments 컬렉션에 모든 결제 기록
    - type 구분: `trial_conversion`, `upgrade`, `downgrade`, `downgrade_refund`, `recurring`, `card_update_retry`, `cancel_refund`

#### 매장/회원 관리
16. **매장 삭제 (Soft Delete)**
    - 90일 보관 후 영구 삭제 예정
    - `tenant_deletions` 컬렉션에 로그 저장
17. **회원 탈퇴 (Soft Delete)**
    - 결제 이력에 따른 차등 보관 (5년/1년)
    - `account_deletions` 컬렉션에 로그 저장

#### UI/UX
18. **Toss Payments Webhook 연동**
19. **결제 내역 표시 (환불 내역 중첩 표시)**
20. **취소 모달 개선**
    - 90일 데이터 보관 정책 안내
    - 환불 계산 내역 인터랙티브 툴팁
21. **구독 내역 정렬 개선**
    - 상태 우선순위: 사용중 > 사용완료 > 해지됨
22. **가격 정책 (Price Policy)**
    - `grandfathered`, `protected_until`, `standard` 지원

### ⚠️ 부분 구현
1. **동시성 제어**: 트랜잭션은 있지만 Optimistic Locking 없음
2. **Toss-DB 상태 동기화**: Webhook은 있지만 환불 처리 확인 필요
3. **날짜 경계 처리**: 기본 구현됨, 엣지 케이스 테스트 필요
4. **데이터 보관 정책**: UI 안내만 있음, 자동 삭제 스케줄러 없음
5. **N8N 알림 웹훅**: 코드 구현됨, 현재 비활성화 상태 (`lib/n8n.ts`에서 제어), N8N 워크플로우 미설정

### ❌ 미구현
1. **알림 이력 관리** (`payment_notifications` 컬렉션 및 중복 방지)
2. **중복 결제 방지 (멱등성 키)**
3. **결제 주기 마지막 날 플랜 변경 제한**
4. **쿠폰/프로모션 코드**
5. **연간 구독**
6. **데이터 자동 삭제 스케줄러** (90일 후)

---

## 8. Vercel Cron Job 상세

### 8.1 설정
- **파일**: `vercel.json`
- **실행 주기**: 매일 00:00 KST (15:00 UTC)
- **엔드포인트**: `/api/cron/billing`
- **인증**: CRON_SECRET 환경변수로 보호

### 8.2 처리 프로세스

#### Phase 1: 무료체험 처리
```typescript
// trial 상태 구독 조회
subscriptions.where('status', '==', 'trial')

// trialEndDate <= 오늘
if (pendingPlan && billingKey) {
  // 자동 전환 + 첫 결제
  status: 'trial' → 'active'
  syncNewSubscription()
  N8N: 'trial_converted'
} else {
  // 만료 처리
  status: 'trial' → 'expired'
  syncTrialExpired()
  N8N: 'trial_expired'
}
```

#### Phase 2: 카드 만료 알림
```typescript
// active 구독의 카드 만료일 체크
if (daysUntilExpiry === 30 || daysUntilExpiry === 7) {
  N8N: 'card_expiring_soon'
}
```

#### Phase 3: 예약 플랜 변경
```typescript
// pendingMode === 'scheduled' 구독 조회
if (pendingChangeAt <= 오늘) {
  plan: previousPlan → pendingPlan
  amount: previousAmount → pendingAmount
  pendingPlan = null
  syncPlanChange()
  N8N: 'pending_plan_applied'
}
```

#### Phase 4: 유예 기간 만료 처리
```typescript
// past_due 상태 구독 조회
subscriptions.where('status', '==', 'past_due')

// 유예 기간이 만료된 구독 찾기
if (gracePeriodUntil && gracePeriodUntil < today) {
  // 유예 기간 만료 - 구독 정지 (D+7에 종료)
  status = 'suspended'
  suspendedAt = today
  syncSubscriptionSuspended()
  N8N: 'grace_period_expired'
}
```

#### Phase 5: 정기 결제
```typescript
// 1. active 구독 조회 (nextBillingDate <= 오늘)
activeSubscriptions
  .where('status', '==', 'active')
  .where('nextBillingDate', '<=', today)

// 2. past_due 구독 중 재시도 대상 조회
pastDueSubscriptions
  .where('status', '==', 'past_due')
  .filter(retryCount < 3 && daysSinceFailure === retryCount)

// 결제 시도
try {
  payWithBillingKey()
  // 성공
  status = 'active'
  nextBillingDate += 1개월
  retryCount = 0
  gracePeriodUntil = null
  lastPaymentError = null
  payments.add({ type: 'recurring' })
  syncPaymentSuccess()
  N8N: 'recurring_payment_success'
} catch {
  // 실패
  retryCount++

  // 1회 실패 시 유예 기간 시작
  if (retryCount === 1) {
    gracePeriodUntil = today + 6일  // D+0부터 D+6까지 (7일)
  }

  status = 'past_due'
  syncPaymentFailure()

  if (retryCount >= 3) {
    // 3회 실패
    N8N: 'payment_failed_grace_period'
  } else {
    // 1~2회 실패
    N8N: `payment_retry_${retryCount}`
  }
}
```

### 8.3 Firebase Composite Index
```
Collection: subscriptions
Fields:
  - status (Ascending)
  - nextBillingDate (Ascending)
  - __name__ (Ascending)
```

### 8.4 응답 형식
```json
{
  "success": true,
  "trialConverted": 2,
  "trialExpired": 1,
  "cardExpiringAlerts": 0,
  "pendingPlansApplied": 1,
  "gracePeriodExpired": 0,
  "paymentsProcessed": 5,
  "details": {
    "convertedTrials": [...],
    "expiredTrials": [...],
    "cardExpiringAlerts": [...],
    "appliedPendingPlans": [...],
    "expiredGracePeriods": [...],
    "billingResults": [...]
  }
}
```

### 8.5 모니터링
- **Vercel 로그**: Deployments → Functions → Cron
- **수동 실행**: `curl -X GET -H "Authorization: Bearer $CRON_SECRET" https://your-domain.com/api/cron/billing`
- **N8N 웹훅**: 각 이벤트별 알림 수신

---

## 9. Firestore 컬렉션 구조

### 9.1 주요 컬렉션

| 컬렉션 | 용도 | 삭제 시 처리 |
|--------|------|-------------|
| `tenants` | 매장 정보 | Soft delete (`deleted: true`) |
| `subscriptions` | 구독 정보 | Soft delete |
| `users` | 회원 정보 | Soft delete + 법령 보관 |
| `cards` | 카드 정보 | **완전 삭제** |
| `payments` | 결제 이력 | 삭제 안함 (법령 보관) |
| `refunds` | 환불 이력 | 삭제 안함 |

### 9.2 로그 컬렉션

| 컬렉션 | 용도 |
|--------|------|
| `tenant_deletions` | 매장 삭제 로그 |
| `account_deletions` | 회원 탈퇴 로그 |
| `payment_notifications` | 알림 이력 (TODO) |

### 9.3 subscriptions 컬렉션 필드

```typescript
{
  // 기본 정보
  tenantId: string,
  email: string,
  brandName: string,

  // 플랜 정보
  plan: 'trial' | 'basic' | 'business',
  amount: number,
  pricePolicy?: 'grandfathered' | 'protected_until' | 'standard',
  priceProtectedUntil?: Date,

  // 구독 상태
  status: 'trial' | 'active' | 'canceled' | 'past_due' | 'suspended' | 'expired',

  // 기간 정보
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  nextBillingDate: Date,
  trialEndDate?: Date,

  // 해지 정보
  canceledAt?: Date,
  cancelReason?: string,
  cancelMode?: 'immediate' | 'scheduled',
  expiredAt?: Date,
  reactivatedAt?: Date,

  // 플랜 변경 예약
  pendingPlan?: string,
  pendingAmount?: number,
  pendingMode?: 'immediate' | 'scheduled',
  pendingChangeAt?: Date,
  previousPlan?: string,
  previousAmount?: number,

  // 결제 정보
  billingKey?: string,
  cardInfo?: object,

  // 결제 실패 처리
  retryCount?: number,
  gracePeriodUntil?: Date,
  lastPaymentError?: string,
  suspendedAt?: Date,

  // 환불 정보
  refundAmount?: number,
  refundProcessed?: boolean,

  // 삭제 정보
  deleted?: boolean,
  deletedAt?: Date,

  // 타임스탬프
  createdAt: Date,
  updatedAt: Date
}
```

---

## 10. 알림 이력 관리 시스템 (TODO)

### 10.1 payment_notifications 컬렉션 구조

```typescript
{
  id: string;                    // 자동 생성
  tenantId: string;              // 테넌트 ID
  email: string;                 // 사용자 이메일
  event: NotificationEvent;      // 이벤트 타입
  status: 'pending' | 'sent' | 'failed';
  metadata: object;              // 이벤트별 추가 데이터
  sentAt?: Timestamp;            // 발송 완료 시간
  failedAt?: Timestamp;          // 발송 실패 시간
  errorMessage?: string;         // 실패 시 에러 메시지
  createdAt: Timestamp;          // 생성 시간
}

type NotificationEvent =
  | 'trial_expired'              // 무료체험 만료
  | 'card_expiring_soon'         // 카드 만료 임박
  | 'payment_retry_1'            // 결제 재시도 1회차
  | 'payment_retry_2'            // 결제 재시도 2회차
  | 'payment_failed_grace_period' // 3회 실패 후 유예 기간 시작
  | 'grace_period_expired'       // 유예 기간 만료
  | 'card_update_retry_success'  // 카드 변경 후 자동 재결제 성공
  | 'recurring_payment_success'  // 정기결제 성공
  | 'pending_plan_applied';      // 예약 플랜 적용
```

### 10.2 구현 계획

#### 1단계: 헬퍼 함수 생성
```typescript
// lib/notification.ts
export async function saveNotification(params: {
  tenantId: string;
  email: string;
  event: NotificationEvent;
  metadata: object;
}): Promise<string> {
  // 중복 체크 (같은 이벤트가 24시간 내 발송되었는지)
  // Firestore에 저장
  // 문서 ID 반환
}

export async function updateNotificationStatus(
  notificationId: string,
  status: 'sent' | 'failed',
  errorMessage?: string
): Promise<void> {
  // 발송 결과 업데이트
}
```

#### 2단계: Cron Job 수정
- N8N 웹훅 전송 전에 `saveNotification()` 호출
- 웹훅 성공/실패에 따라 `updateNotificationStatus()` 호출
- 중복 체크로 24시간 내 동일 알림 방지

#### 3단계: 중복 방지 로직
```typescript
// 카드 만료 알림 예시
const recentNotification = await db
  .collection('payment_notifications')
  .where('tenantId', '==', tenantId)
  .where('event', '==', 'card_expiring_soon')
  .where('createdAt', '>=', last24Hours)
  .limit(1)
  .get();

if (!recentNotification.empty) {
  // 이미 발송했으므로 스킵
  return;
}
```

### 10.3 혜택

1. **알림 추적**: 어떤 사용자에게 언제 어떤 알림을 보냈는지 기록
2. **중복 방지**: 카드 만료 알림 등 매일 중복 발송 방지
3. **실패 재시도**: 실패한 알림 재발송 가능
4. **통계 분석**: 알림 발송률, 성공률 등 분석 가능
5. **고객 지원**: 고객 문의 시 알림 이력 확인 가능

### 10.4 Firebase Composite Index

```
Collection: payment_notifications
Fields:
  - tenantId (Ascending)
  - event (Ascending)
  - createdAt (Descending)
```

---

## 11. 참고 자료

### 글로벌 베스트 프랙티스
- [Stripe: Prorations Documentation](https://docs.stripe.com/billing/subscriptions/prorations) - 플랜 변경 시 일할 계산 가이드
- [Paddle: Proration & Prorated Billing](https://www.paddle.com/resources/proration) - 프로레이션 개념 설명
- [Chargebee: Billing Mode & Proration](https://www.chargebee.com/docs/billing/2.0/subscriptions/proration) - 다양한 프로레이션 모드
- [RevenueCat: Google Play Subscription Lifecycle](https://www.revenuecat.com/blog/engineering/google-play-lifecycle/) - 구독 생명주기 관리
- [Recurly: Subscription Management Best Practices](https://recurly.com/blog/five-subscription-management-best-practices-for-every-type-of-business-model/) - 구독 관리 베스트 프랙티스

### 한국 결제 시스템
- [토스페이먼츠: 구독 결제 서비스 구현하기 (빌링키)](https://www.tosspayments.com/blog/articles/22425)
- [토스페이먼츠: 구독 결제 서비스 구현하기 (스케줄링)](https://docs.tosspayments.com/blog/subscription-service-2)

### 엣지 케이스 & 트러블슈팅
- [Subscription Billing Cycle Best Practices](https://www.subscriptionflow.com/2025/05/optimizing-your-subscription-billing-cycle/)
- [Kinde: Proration Explained](https://kinde.com/learn/billing/plans/proration-explained-how-to-handle-subscription-upgrades-and-downgrades-fairly-and-efficiently/)

---

## 12. 다음 구현 우선순위

### Phase 1: 안정성 (Critical)
1. **중복 결제 방지** (멱등성 키)
2. **동시성 제어 강화** (Optimistic Locking)
3. **음수 환불 방지** 체크 로직

### Phase 2: 사용자 경험 (High Priority)
4. **알림 이력 관리 시스템** (`payment_notifications` 컬렉션)
   - N8N 웹훅 전송 시 Firestore에 저장
   - 중복 알림 방지 (카드 만료 알림 매일 발송 방지)
   - 알림 발송 이력 조회 및 통계
   - 실패 시 재시도 메커니즘
5. **데이터 자동 삭제 스케줄러** - 90일 후 자동 삭제

### Phase 3: 비즈니스 로직 (Medium Priority) (선택사항)
6. **쿠폰/프로모션 코드**
7. **연간 구독**
8. **결제 주기 마지막 날 플랜 변경 제한**

### Phase 4: 글로벌 확장 (Low Priority) (선택사항)
9. **세금/VAT 처리**
10. **다중 통화 지원**
