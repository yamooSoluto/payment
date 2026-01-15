# 성능 최적화 작업 목록

## 현재 상황 분석 (2026-01-15)

### 비교 분석 결과

| 항목 | studymoa (참고) | yamoo (현재) |
|------|----------------|--------------|
| 요청 수 | 5개 | 15개 |
| 가장 느린 요청 | 45ms | **2.86초** |
| 평균 API 응답 | 30ms | 300ms ~ 1초 |
| 전송량 | 3.3 kB | 8.1 kB |

### 주요 문제점

1. **API 응답 속도가 느림** (300ms ~ 3초)
2. **요청이 순차적으로 실행됨** (Waterfall 패턴)
3. **클라이언트 캐싱 없음** (매번 새로 fetch)
4. **RSC 오버헤드** (매 네비게이션마다 서버 왕복)

---

## 우선순위별 작업 목록

### 1단계: Firebase 쿼리 최적화 (높음)

API 응답 자체가 1초 이상이면 캐싱을 해도 첫 로드가 느림.

- [ ] Firestore 복합 인덱스 추가
  - `subscriptions` 컬렉션: `email + status` 복합 인덱스
  - `payments` 컬렉션: `tenantId + createdAt` 복합 인덱스

- [ ] 쿼리 배치 처리
  ```typescript
  // Before: 순차 쿼리
  const tenant = await db.collection('tenants').doc(id).get();
  const subscription = await db.collection('subscriptions').doc(id).get();

  // After: 병렬 쿼리
  const [tenant, subscription] = await Promise.all([
    db.collection('tenants').doc(id).get(),
    db.collection('subscriptions').doc(id).get(),
  ]);
  ```

- [ ] 필요한 필드만 선택적으로 가져오기 (select)

### 2단계: 클라이언트 캐싱 도입 (높음)

SWR 또는 React Query 도입으로 체감 속도 개선.

- [ ] SWR 설치 및 설정
  ```bash
  npm install swr
  ```

- [ ] 데이터 fetching 훅 마이그레이션
  ```typescript
  // Before
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch('/api/members').then(r => r.json()).then(setData);
  }, []);

  // After
  const { data, isLoading } = useSWR('/api/members', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000, // 1분간 중복 요청 방지
  });
  ```

- [ ] 적용 대상 페이지
  - `/admin/members` - 회원 목록
  - `/admin/members/[id]` - 회원 상세
  - `/admin/subscriptions` - 구독 목록
  - `/account` - 마이페이지
  - `/account/[tenantId]` - 매장 상세

### 3단계: 프리페칭 구현 (중간)

링크 hover 시 미리 데이터 로드.

- [ ] Next.js Link prefetch 활용
  ```tsx
  <Link href="/admin/members/123" prefetch={true}>
    회원 상세
  </Link>
  ```

- [ ] SWR preload 활용
  ```typescript
  const handleMouseEnter = (id: string) => {
    preload(`/api/members/${id}`, fetcher);
  };
  ```

### 4단계: API 응답 최적화 (중간)

- [ ] 불필요한 데이터 제거
- [ ] 페이지네이션 적용 (큰 목록)
- [ ] 응답 압축 확인

### 5단계: Vercel 최적화 (낮음)

- [ ] Edge Functions 검토 (cold start 감소)
- [ ] 정적 페이지 ISR 적용 가능 여부 검토

---

## 기대 효과

| 작업 | 예상 개선 |
|------|----------|
| Firebase 쿼리 최적화 | API 응답 1초 → 200ms |
| SWR 캐싱 | 재방문 시 즉시 표시 (0ms) |
| 프리페칭 | 첫 방문도 즉시 표시 |

**목표**: 모든 페이지 전환 시 **200ms 이내** 데이터 표시

---

## 참고 자료

- [SWR 공식 문서](https://swr.vercel.app/ko)
- [Firestore 쿼리 최적화](https://firebase.google.com/docs/firestore/query-data/indexing)
- [Next.js 캐싱](https://nextjs.org/docs/app/building-your-application/caching)
