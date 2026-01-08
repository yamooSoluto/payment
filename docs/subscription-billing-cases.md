# 구독 결제 시스템 케이스 정리

구독 결제 시스템 구현 시 고려해야 할 모든 시나리오와 엣지 케이스를 정리한 문서입니다.

## 목차
1. [기본 구독 시나리오](#1-기본-구독-시나리오)
2. [플랜 변경 시나리오](#2-플랜-변경-시나리오)
3. [구독 해지 시나리오](#3-구독-해지-시나리오)
4. [결제 실패 처리](#4-결제-실패-처리)
5. [엣지 케이스](#5-엣지-케이스)
6. [현재 구현 상태](#6-현재-구현-상태)
7. [Vercel Cron Job 상세](#7-vercel-cron-job-상세)
8. [알림 이력 관리 시스템 (TODO)](#8-알림-이력-관리-시스템-todo)
9. [참고 자료](#9-참고-자료)
10. [다음 구현 우선순위](#10-다음-구현-우선순위)

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

### 2.1 업그레이드 (즉시)
- **케이스**: Basic → Business 플랜 변경
- **계산 로직**:
  ```
  남은 일수 = currentPeriodEnd - 오늘
  기존 플랜 환불액 = (현재 플랜 가격 / 총 일수) × 남은 일수
  새 플랜 결제액 = (새 플랜 가격 / 총 일수) × (남은 일수 + 1)
  실제 결제 금액 = 새 플랜 결제액 - 기존 플랜 환불액
  ```
- **처리**:
  - 즉시 차액 결제
  - `currentPeriodStart` = 오늘로 업데이트
  - `amount` = 새 플랜 정가 (다음 결제부터 적용)
  - 플랜 상태 즉시 변경
- **구현 상태**: ✅ 완료

### 2.2 다운그레이드 (즉시)
- **케이스**: Business → Basic 플랜 변경
- **계산 로직**:
  ```
  남은 일수 = currentPeriodEnd - 오늘
  기존 플랜 환불액 = (현재 플랜 가격 / 총 일수) × 남은 일수
  새 플랜 결제액 = (새 플랜 가격 / 총 일수) × (남은 일수 + 1)
  실제 환불 금액 = 기존 플랜 환불액 - 새 플랜 결제액
  ```
- **처리**:
  - Toss Payments API로 부분 환불 요청
  - `currentPeriodStart` = 오늘로 업데이트
  - `amount` = 새 플랜 정가
  - payments 컬렉션에 환불 내역 저장 (`type: 'downgrade_refund'`)
  - `originalPaymentId` 연결
- **구현 상태**: ✅ 완료

### 2.3 플랜 변경 예약 (다음 결제일부터 적용)
- **케이스**: 사용자가 즉시 변경이 아닌 예약 선택
- **처리**:
  - `pendingPlan`, `pendingAmount` 필드에 저장
  - 현재 구독은 그대로 유지
  - 다음 결제일에 자동으로 플랜 변경 + 새 금액 결제
- **구현 상태**: ✅ 완료

### 2.4 엣지 케이스: 결제 주기 마지막 날 변경
- **케이스**: currentPeriodEnd - 1일에 플랜 변경
- **문제점**: 남은 일수가 0일 또는 1일
- **처리**:
  - 남은 일수가 0일: 즉시 변경 불가, 예약만 가능
  - 남은 일수가 1일: 미니멈 결제액 설정 (예: 1,000원 이상)
- **구현 상태**: ❌ 미구현

### 2.5 엣지 케이스: 결제 주기 첫날 변경
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
  - `canceledAt`, `cancelReason` 저장
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
  - 즉시 서비스 이용 중단
  - refunds 컬렉션에 환불 내역 저장
- **구현 상태**: ✅ 완료

### 3.3 환불 계산 엣지 케이스
#### 3.3.1 플랜 변경 후 즉시 해지
- **문제**: 플랜 변경으로 일할 계산된 금액으로 결제했는데, `subscription.amount`에는 정가가 저장됨
- **해결**: `currentPeriodStart`를 플랜 변경일로 업데이트하여 정확한 기간 계산
- **구현 상태**: ✅ 완료 (오늘 수정)

#### 3.3.2 마지막 날 즉시 해지
- **케이스**: 결제 주기 마지막 날 즉시 해지
- **처리**: 환불액 = 0원
- **구현 상태**: ✅ 로직상 처리됨

#### 3.3.3 결제 직후 즉시 해지
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
- **구현 상태**: ⚠️ 확인 필요

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

### 5.8 데이터 보관/삭제 정책
#### 5.8.1 구독 해지 후 데이터 보관
- **정책**: 90일간 보관 후 삭제
- **처리**:
  - `dataRetentionUntil` = 해지일 + 90일
  - Cron job으로 매일 삭제 대상 확인
- **구현 상태**: ⚠️ UI 안내는 있지만 자동 삭제 없음

#### 5.8.2 재구독 시 데이터 복구
- **처리**:
  - 90일 이내 재구독: 데이터 복구
  - 90일 이후: 신규 시작
- **구현 상태**: ⚠️ 확인 필요

---

## 6. 현재 구현 상태

### ✅ 완료된 기능

#### 구독 관리
1. **무료 체험 시작 및 관리**
   - 카드 등록 없이 체험 시작
   - 빌링키는 유료 전환 시점에 등록
2. **무료 체험 → 유료 전환**
   - 즉시 전환: 카드 등록 + 즉시 결제
   - 예약 전환: `pendingPlan` 저장 → 체험 종료일에 자동 전환
3. **플랜 업그레이드/다운그레이드 (즉시)**
   - 일할 계산 환불/결제
   - `currentPeriodStart` 업데이트로 정확한 환불 계산
4. **플랜 변경 예약 (다음 결제일부터)**
   - `pendingPlan`, `pendingAmount`, `pendingMode` 저장
   - Cron Job에서 자동 적용
5. **구독 해지**
   - 예약 해지: `currentPeriodEnd`까지 이용 가능
   - 즉시 해지: 일할 환불 + 즉시 서비스 중단
   - 환불 내역 저장 (`type: 'downgrade_refund'`, `originalPaymentId` 연결)

#### 결제 자동화 (Vercel Cron Job)
6. **정기 결제 자동 처리**
   - 실행 주기: 매일 00:00 KST (`vercel.json`)
   - Firebase Composite Index 설정 완료
   - CRON_SECRET 인증 적용
7. **무료체험 만료 처리**
   - `pendingPlan` 있으면: 자동 전환 + 첫 결제
   - `pendingPlan` 없으면: `status = 'expired'`
8. **카드 만료 사전 알림**
   - 30일 전, 7일 전 알림 전송
9. **예약 플랜 변경 자동 적용**
   - `pendingChangeAt` 도달 시 자동 적용
10. **결제 실패 재시도 (Dunning) 및 유예 기간**
    - D+0, D+1, D+2 재시도 (3회)
    - 1회 실패 시 즉시 `status = 'past_due'` 변경 및 `gracePeriodUntil = D+6` 설정
    - 유예 기간: D+0 ~ D+6 (총 7일)
    - D+7 (8일차)에 유예 기간 만료 시 `status = 'suspended'`
    - 유예 기간 중 서비스 계속 이용 가능
11. **카드 업데이트 시 자동 재결제**
    - `past_due` 상태에서 카드 변경 시 즉시 재결제 시도
    - 성공 시 `status = 'active'` 복구
    - 실패 시 다음 재시도 일정에 따라 진행

#### 데이터 동기화 & 알림
12. **tenants 컬렉션 자동 동기화**
    - `syncNewSubscription`: 무료체험 전환 시
    - `syncTrialExpired`: 체험 만료 시
    - `syncPlanChange`: 플랜 변경 시
    - `syncPaymentSuccess`: 결제 성공 시
    - `syncPaymentFailure`: 결제 실패 시
    - `syncSubscriptionSuspended`: 유예 기간 만료 시
13. **N8N 웹훅 알림**
    - `trial_expired`: 무료체험 만료
    - `card_expiring_soon`: 카드 만료 임박 (30일/7일 전)
    - `pending_plan_applied`: 예약 플랜 적용
    - `recurring_payment_success`: 정기결제 성공
    - `payment_retry_1`, `payment_retry_2`: 결제 재시도
    - `payment_failed_grace_period`: 3회 실패 후 유예 기간 시작
    - `grace_period_expired`: 유예 기간 만료
    - `card_update_retry_success`: 카드 변경 후 자동 재결제 성공
14. **결제 내역 자동 저장**
    - payments 컬렉션에 모든 결제 기록
    - type 구분: `trial_conversion`, `upgrade`, `downgrade`, `downgrade_refund`, `recurring`, `card_update_retry`

#### UI/UX
15. **Toss Payments Webhook 연동**
16. **결제 내역 표시 (환불 내역 중첩 표시)**
17. **취소 모달 개선**
    - 90일 데이터 보관 정책 안내
    - 환불 계산 내역 인터랙티브 툴팁
18. **구독 내역 정렬 개선**
    - 상태 우선순위: 사용중 > 사용완료 > 해지됨

### ⚠️ 부분 구현
1. **동시성 제어**: 트랜잭션은 있지만 Optimistic Locking 없음
2. **Toss-DB 상태 동기화**: Webhook은 있지만 환불 처리 확인 필요
3. **날짜 경계 처리**: 기본 구현됨, 엣지 케이스 테스트 필요
4. **데이터 보관 정책**: UI 안내만 있음
5. **N8N 웹훅 알림**: 웹훅 전송 코드는 있지만 Firestore 저장 없음, 중복 방지 없음

### ❌ 미구현
1. **알림 이력 관리** (`payment_notifications` 컬렉션 및 중복 방지)
2. **중복 결제 방지 (멱등성 키)**
3. **결제 주기 마지막 날 플랜 변경 제한**
4. **세금/VAT 처리**
5. **쿠폰/프로모션 코드**
6. **연간 구독**
7. **데이터 자동 삭제 스케줄러** (90일 후)

---

## 7. Vercel Cron Job 상세

### 7.1 설정
- **파일**: `vercel.json`
- **실행 주기**: 매일 00:00 KST (15:00 UTC)
- **엔드포인트**: `/api/cron/billing`
- **인증**: CRON_SECRET 환경변수로 보호

### 7.2 처리 프로세스

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

### 7.3 Firebase Composite Index
```
Collection: subscriptions
Fields:
  - status (Ascending)
  - nextBillingDate (Ascending)
  - __name__ (Ascending)
```

### 7.4 응답 형식
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

### 7.5 모니터링
- **Vercel 로그**: Deployments → Functions → Cron
- **수동 실행**: `curl -X GET -H "Authorization: Bearer $CRON_SECRET" https://your-domain.com/api/cron/billing`
- **N8N 웹훅**: 각 이벤트별 알림 수신

---

## 8. 알림 이력 관리 시스템 (TODO)

### 8.1 payment_notifications 컬렉션 구조

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

### 8.2 구현 계획

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

### 8.3 혜택

1. **알림 추적**: 어떤 사용자에게 언제 어떤 알림을 보냈는지 기록
2. **중복 방지**: 카드 만료 알림 등 매일 중복 발송 방지
3. **실패 재시도**: 실패한 알림 재발송 가능
4. **통계 분석**: 알림 발송률, 성공률 등 분석 가능
5. **고객 지원**: 고객 문의 시 알림 이력 확인 가능

### 8.4 Firebase Composite Index

```
Collection: payment_notifications
Fields:
  - tenantId (Ascending)
  - event (Ascending)
  - createdAt (Descending)
```

---

## 9. 참고 자료

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

## 10. 다음 구현 우선순위

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

### Phase 3: 비즈니스 로직 (Medium Priority)
6. **쿠폰/프로모션 코드**
7. **연간 구독**
8. **결제 주기 마지막 날 플랜 변경 제한**

### Phase 4: 글로벌 확장 (Low Priority)
9. **세금/VAT 처리**
10. **다중 통화 지원**
