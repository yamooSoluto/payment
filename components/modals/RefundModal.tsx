'use client';

import { Xmark } from 'iconoir-react';

interface RefundModalProps {
  onClose: () => void;
}

export default function RefundModal({ onClose }: RefundModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="bg-white rounded-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold">환불 정책</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Xmark width={20} height={20} strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto text-sm text-gray-700 space-y-4">
          <h3 className="font-bold text-base">환불 정책 안내</h3>
          <p>
            YAMOO 서비스는 아래와 같은 환불 정책을 운영하고 있습니다.
            고객님의 권리 보호를 위해 꼼꼼히 확인해 주세요.
          </p>

          <h3 className="font-bold text-base">1. 전액 환불</h3>
          <p>다음의 경우 결제 금액 전액을 환불받으실 수 있습니다:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>결제 후 7일 이내에 서비스를 전혀 이용하지 않은 경우</li>
            <li>회사의 귀책사유로 서비스 이용이 불가능한 경우</li>
          </ul>

          <h3 className="font-bold text-base">2. 부분 환불 (일할 계산)</h3>
          <p>
            서비스 이용 후 환불 요청 시, 이용 기간에 해당하는 금액을 일할 계산하여
            공제한 후 남은 금액을 환불해 드립니다.
          </p>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="font-semibold">환불 금액 계산 예시:</p>
            <p className="mt-2">
              월 구독료 59,000원, 15일 이용 후 환불 요청 시<br />
              → 59,000원 - (59,000원 × 15/30) = 29,500원 환불
            </p>
          </div>

          <h3 className="font-bold text-base">3. 환불 불가</h3>
          <p>다음의 경우에는 환불이 불가합니다:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>이용약관 위반으로 서비스 이용이 제한된 경우</li>
            <li>프로모션 할인을 적용받은 결제 (별도 안내된 경우 제외)</li>
          </ul>

          <h3 className="font-bold text-base">4. 환불 절차</h3>
          <ol className="list-decimal pl-5 space-y-1">
            <li>이메일(yamoo@soluto.co.kr)로 환불 요청</li>
            <li>담당자 확인 후 환불 금액 안내 (1-2 영업일)</li>
            <li>환불 동의 시 처리 (3-5 영업일 내 카드사 취소)</li>
          </ol>

          <h3 className="font-bold text-base">5. 구독 해지</h3>
          <p>
            구독 해지는 언제든지 가능하며, 해지 시 다음 결제 예정일에
            자동 결제가 중단됩니다. 해지 후에도 남은 구독 기간 동안은
            서비스를 계속 이용하실 수 있습니다.
          </p>

          <h3 className="font-bold text-base">6. 문의</h3>
          <p>
            환불 관련 문의사항은 아래로 연락해 주세요:
          </p>
          <ul className="list-none space-y-1">
            <li>이메일: yamoo@soluto.co.kr</li>
            <li>운영시간: 평일 10:00~17:00 (점심 12:00~13:00)</li>
          </ul>

          <p className="text-gray-500 pt-4 border-t">
            본 환불 정책은 2024년 12월 21일부터 적용됩니다.
          </p>
        </div>

        <div className="p-6 border-t">
          <button onClick={onClose} className="btn-primary w-full">
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
