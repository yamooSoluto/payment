// 업종 코드 - n8n trial-start에서 사용하는 값과 동일
export const INDUSTRIES = {
  study_cafe: '스터디카페 / 독서실',
  self_store: '무인매장 / 셀프운영 매장',
  cafe_restaurant: '카페 / 음식점',
  fitness: '피트니스 / 운동공간',
  beauty: '뷰티 / 미용',
  education: '교육 / 학원',
  rental_space: '공간대여 / 숙박',
  retail_business: '소매 / 유통 / 판매업',
  other: '기타',
} as const;

export type IndustryCode = keyof typeof INDUSTRIES;

// 업종 코드 유효성 검사
export function isValidIndustry(code: string): code is IndustryCode {
  return code in INDUSTRIES;
}

// 업종 옵션 목록 (select 컴포넌트용)
export const INDUSTRY_OPTIONS = Object.entries(INDUSTRIES).map(([code, label]) => ({
  value: code,
  label,
}));
