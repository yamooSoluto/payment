'use client';

import { X } from 'lucide-react';

interface TermsModalProps {
  onClose: () => void;
}

export default function TermsModal({ onClose }: TermsModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="bg-white rounded-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold">이용약관</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto text-sm text-gray-700 space-y-4">
          <h3 className="font-bold text-base">제1조 (목적)</h3>
          <p>
            본 약관은 주식회사 솔루투(이하 &quot;회사&quot;)가 제공하는 YAMOO 서비스(이하 &quot;서비스&quot;)의
            이용조건 및 절차, 회사와 이용자의 권리, 의무 및 책임사항 등을 규정함을 목적으로 합니다.
          </p>

          <h3 className="font-bold text-base">제2조 (정의)</h3>
          <p>
            1. &quot;서비스&quot;란 회사가 제공하는 CS 자동화 솔루션 및 관련 부가서비스를 의미합니다.
          </p>
          <p>
            2. &quot;이용자&quot;란 본 약관에 따라 회사가 제공하는 서비스를 이용하는 회원 및 비회원을 말합니다.
          </p>
          <p>
            3. &quot;구독&quot;이란 이용자가 서비스를 정기적으로 이용하기 위해 월 단위로 결제하는 것을 의미합니다.
          </p>

          <h3 className="font-bold text-base">제3조 (약관의 효력 및 변경)</h3>
          <p>
            1. 본 약관은 서비스를 이용하고자 하는 모든 이용자에게 적용됩니다.
          </p>
          <p>
            2. 회사는 필요한 경우 약관을 변경할 수 있으며, 변경된 약관은 서비스 내 공지사항을 통해 공지합니다.
          </p>

          <h3 className="font-bold text-base">제4조 (서비스 이용)</h3>
          <p>
            1. 서비스는 연중무휴, 1일 24시간 제공함을 원칙으로 합니다.
          </p>
          <p>
            2. 회사는 컴퓨터 등 정보통신설비의 보수점검, 교체 및 고장, 통신두절 또는 운영상 상당한 이유가 있는 경우 서비스의 제공을 일시적으로 중단할 수 있습니다.
          </p>

          <h3 className="font-bold text-base">제5조 (구독 및 결제)</h3>
          <p>
            1. 이용자는 회사가 정한 요금제를 선택하여 구독할 수 있습니다.
          </p>
          <p>
            2. 구독 요금은 매월 정기적으로 결제되며, 결제일은 최초 결제일을 기준으로 합니다.
          </p>
          <p>
            3. 이용자는 언제든지 구독을 해지할 수 있으며, 해지 시 다음 결제 예정일에 자동 결제가 중단됩니다.
          </p>

          <h3 className="font-bold text-base">제6조 (환불 정책)</h3>
          <p>
            1. 결제 후 7일 이내에 서비스를 전혀 이용하지 않은 경우 전액 환불이 가능합니다.
          </p>
          <p>
            2. 서비스 이용 후에는 이용 기간에 비례하여 일할 계산된 금액을 공제하고 환불합니다.
          </p>
          <p>
            3. 무료체험 기간 중에는 별도의 환불 절차가 필요하지 않습니다.
          </p>

          <h3 className="font-bold text-base">제7조 (이용자의 의무)</h3>
          <p>
            1. 이용자는 서비스 이용 시 관련 법령, 본 약관의 규정, 이용안내 및 주의사항 등을 준수해야 합니다.
          </p>
          <p>
            2. 이용자는 회사의 사전 동의 없이 서비스를 이용하여 영업활동을 할 수 없습니다.
          </p>

          <h3 className="font-bold text-base">제8조 (회사의 의무)</h3>
          <p>
            1. 회사는 관련 법령과 본 약관이 금지하거나 공서양속에 반하는 행위를 하지 않습니다.
          </p>
          <p>
            2. 회사는 계속적이고 안정적인 서비스의 제공을 위해 최선을 다합니다.
          </p>

          <h3 className="font-bold text-base">제9조 (면책조항)</h3>
          <p>
            1. 회사는 천재지변 또는 이에 준하는 불가항력으로 인해 서비스를 제공할 수 없는 경우 책임이 면제됩니다.
          </p>
          <p>
            2. 회사는 이용자의 귀책사유로 인한 서비스 이용의 장애에 대해 책임을 지지 않습니다.
          </p>

          <h3 className="font-bold text-base">제10조 (분쟁해결)</h3>
          <p>
            본 약관에 관한 분쟁은 대한민국 법률에 따라 해결하며, 관할 법원은 회사 소재지 관할 법원으로 합니다.
          </p>

          <p className="text-gray-500 pt-4 border-t">
            부칙: 본 약관은 2024년 12월 21일부터 시행됩니다.
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
