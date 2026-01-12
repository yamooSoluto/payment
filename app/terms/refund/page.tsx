import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '결제 취소 및 환불 규정 | YAMOO',
  description: 'YAMOO 서비스 결제 취소 및 환불 규정 안내',
};

export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h1 className="text-2xl font-bold text-gray-900">결제 취소 및 환불 규정</h1>
            <p className="text-sm text-gray-500 mt-1">YAMOO 서비스이용약관 제16조</p>
          </div>

          <div className="p-6 text-sm text-gray-700 space-y-4">
            <p>
              1. 이용자는 본 약관 및 서비스 내에 안내된 절차에 따라 언제든지 제공자에 해지 의사를 통지함으로써 이용 중인 서비스의 일부 또는 전체에 대한 해지를 신청할 수 있다.
            </p>

            <div>
              <p className="mb-2">2. 제1항에 따른 해지 신청 시 환불 기준은 다음과 같다.</p>
              <div className="pl-4 space-y-3">
                <div>
                  <p className="font-medium">① 즉시 해지 신청 시</p>
                  <div className="pl-4 mt-1 space-y-1">
                    <p>가. 환불 금액은 결제 금액을 해당 결제 주기의 총 일수로 나눈 후, 잔여 일수를 곱하여 일할계산한다.</p>
                    <p>나. 잔여 일수는 해지 신청일 다음 날부터 다음 결제일까지의 일수로 계산한다.</p>
                    <p>다. 환불 금액은 원 단위에서 반올림하여 산정한다.</p>
                    <p>라. 즉시 해지 시 환불 처리와 함께 서비스 이용이 즉시 중단된다.</p>
                    <p>마. 무료 체험기간은 환불 계산 대상 기간에 포함되지 않는다.</p>
                  </div>
                </div>
                <div>
                  <p className="font-medium">② 예약 해지(기간 종료 후 해지) 신청 시</p>
                  <div className="pl-4 mt-1 space-y-1">
                    <p>가. 현재 결제 주기 종료일까지 서비스를 정상적으로 이용할 수 있다.</p>
                    <p>나. 다음 결제일에 자동 결제가 중단되며, 별도의 환불은 진행되지 않는다.</p>
                  </div>
                </div>
              </div>
            </div>

            <p>
              3. 제공자는 전항에 따라 유료 이용자의 환불 요청을 처리하는 과정에서, 서비스의 사용 여부와 이용자를 식별하기 위한 추가 정보를 요청할 수 있다.
            </p>

            <p>
              4. 제공자는 환불 금액이 있는 경우, 원칙적으로 유료이용자의 해지 의사 확인을 한 날로부터 3~5영업일 이내에 결제수단 별 사업자에게 대금의 청구 정지 내지 취소를 요청하고, 유료이용자가 결제한 동일 결제수단으로 환불함을 원칙으로 한다.
            </p>

            <p>
              5. 개인정보 도용 및 결제정보 도용 또는 부정결제 등으로 인한 경우에는 환불되지 않으며, 해당 경우의 결제자 개인정보 요구 및 확인은 관련법령에 근거한 수사기관의 정당한 요청을 통해서만 확인이 가능하다.
            </p>

            <div>
              <p className="mb-2">6. 제공자는 아래 각 호의 사유가 발생하는 경우, 이용자와의 서비스 이용계약을 해지하거나 해제할 수 있다.</p>
              <div className="pl-4 space-y-1">
                <p>① 이용자가 본 약관 또는 관계 법령을 위반하여 계약의 목적 달성이 어려운 경우</p>
                <p>② 이용자가 서비스 이용자격 관련 정보 등 중요 기재사항을 허위로 작성한 경우</p>
                <p>③ 이용자가 결제를 위한 정보를 제대로 등록하지 않아 과금에 문제가 발생할 소지가 있거나 실제로 과금이 제대로 이루어지지 않는 경우</p>
                <p>④ 이용자가 타인의 명의, 결제 정보를 도용하거나 이를 사용한 경우</p>
                <p>⑤ 이용자가 제공자의 서비스를 부정한 목적으로 사용한 경우</p>
                <p>⑥ 이용자가 제공자의 서비스 운영을 방해한 경우</p>
                <p>⑦ 이용자가 바이러스 프로그램을 유포하거나, 해킹을 한 경우</p>
                <p>⑧ 기타 제공자가 객관적으로 판단하여 서비스 이용 거부가 필요하다고 판단한 경우 등</p>
              </div>
            </div>

            <p>
              7. 신용카드 만료, 계좌 잔액 부족 또는 기타 사유로 인하여 요금 결제가 성공적으로 진행되지 않은 경우, 제공자는 이용자에게 직접 미납금액을 청구하거나, 결제정보 정정을 요청하여 결제가 이루어질 때까지 계속하여 결제를 시도하거나, 제공자의 판단으로 본 계약을 해지할 수 있다.
            </p>

            <p>
              8. 제공자는 본 조에 따라 이용 계약을 해지 및 해제하는 경우 상당한 기간을 정하여 이용자에게 이의 신청 기회를 부여할 수 있다.
            </p>

            <p>
              9. 제공자는 제7항의 이의 신청이 정당하다고 인정되는 경우 즉시 서비스 이용을 재개한다.
            </p>

            <p>
              10. 계약이 해지됨에 따라 이용자의 상담 데이터 및 계정 데이터는 삭제될 수 있고, 삭제된 데이터는 복구되지 않을 수 있으며, 이에 대한 책임은 전적으로 이용자에게 있다.
            </p>
          </div>

          <div className="p-6 border-t border-gray-200 bg-gray-50">
            <Link
              href="/"
              className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900"
            >
              ← 홈으로 돌아가기
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
