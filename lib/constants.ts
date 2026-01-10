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

// 한글 라벨 → 코드 역매핑 (DB에 한글로 저장된 경우 대응)
export const INDUSTRY_LABEL_TO_CODE: Record<string, IndustryCode> = Object.fromEntries(
  Object.entries(INDUSTRIES).map(([code, label]) => [label, code as IndustryCode])
) as Record<string, IndustryCode>;

// 업종별 아이콘 이름 매핑 (iconoir-react)
export const INDUSTRY_ICONS: Record<IndustryCode, string> = {
  study_cafe: 'SleeperChair',
  self_store: 'Shop',
  cafe_restaurant: 'CoffeeCup',
  fitness: 'Gym',
  beauty: 'Scissor',
  education: 'Book',
  rental_space: 'Key',
  retail_business: 'Cart',
  other: 'Sofa',
};
