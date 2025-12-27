'use client';

import { Xmark } from 'iconoir-react';

interface PrivacyModalProps {
  onClose: () => void;
}

export default function PrivacyModal({ onClose }: PrivacyModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="bg-white rounded-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold">개인정보처리방침</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Xmark width={20} height={20} strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto text-sm text-gray-700 space-y-4">
          <p>
            주식회사 솔루투는 (이하 &apos;회사&apos;는) 고객님의 개인정보를 중요시하며,
            &quot;정보통신망 이용촉진 및 정보보호&quot;에 관한 법률을 준수하고 있습니다.
          </p>
          <p>
            회사는 개인정보처리방침을 통하여 고객님께서 제공하시는 개인정보가 어떠한 용도와
            방식으로 이용되고 있으며, 개인정보보호를 위해 어떠한 조치가 취해지고 있는지 알려드립니다.
          </p>
          <p>
            회사는 개인정보처리방침을 개정하는 경우 웹사이트 공지사항(또는 개별공지)을 통하여 공지할 것입니다.
          </p>

          <h3 className="font-bold text-base">■ 수집하는 개인정보 항목</h3>
          <p>회사는 회원가입, 상담, 서비스 신청 등을 위해 아래와 같은 개인정보를 수집하고 있습니다.</p>
          <p>
            ο 수집항목 : 이름, 생년월일, 성별, 로그인ID, 비밀번호, 주소, 휴대전화번호, 이메일,
            법정대리인정보, 주민등록번호, 서비스 이용기록, 접속 로그, 접속 IP 정보, 결제기록, 암호화된 이용자 확인값(CI)
          </p>
          <p>ο 개인정보 수집방법 : 홈페이지(회원가입), 서면양식</p>

          <h3 className="font-bold text-base">■ 개인정보의 수집 및 이용목적</h3>
          <p>회사는 수집한 개인정보를 다음의 목적을 위해 활용합니다.</p>
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              사이트 회원 가입 및 관리 : 회원가입시 본인여부 확인, 서비스 이용 및 상담, 공지사항 전달,
              SNS 및 제3자 계정을 연계하여 간편로그인 서비스 제공
            </li>
            <li>재화 또는 서비스 제공: 물품배송, 서비스 제공, 콘텐츠 제공, 맞춤서비스 제공, 정산 및 환불</li>
            <li>마케팅 및 광고: 웹 페이지 접속빈도 파악 또는 회원의 서비스 이용에 대한 통계, 이벤트 등 광고성 정보 전달</li>
            <li>호스팅사 이전 시 발생하는 모든 회원정보 이관 처리</li>
          </ol>
          <p className="text-gray-500 text-xs">
            *회사의 서비스 이용 과정에서 서비스 이용기록, 방문기록, 불량 이용기록, IP 주소, 쿠키,
            광고식별자 등의 정보가 자동으로 생성되어 수집될 수 있습니다.
          </p>
          <p className="text-gray-500 text-xs">
            *진행하는 이벤트에 따라 수집 항목이 상이할 수 있으므로 응모 시 별도 동의를 받으며, 목적 달성 즉시 파기합니다.
          </p>

          <h3 className="font-bold text-base">■ 개인정보의 보유 및 이용기간</h3>
          <p>회사는 개인정보 수집 및 이용목적이 달성된 후에는 예외 없이 해당 정보를 지체 없이 파기합니다.</p>

          <h3 className="font-bold text-base">■ 개인정보의 파기절차 및 방법</h3>
          <p>
            회사는 원칙적으로 개인정보 수집 및 이용목적이 달성된 후에는 해당 정보를 지체없이 파기합니다.
            파기절차 및 방법은 다음과 같습니다.
          </p>
          <p className="font-medium">ο 파기절차</p>
          <p>
            회원님이 회원가입 등을 위해 입력하신 정보는 목적이 달성된 후 별도의 DB로 옮겨져(종이의 경우 별도의 서류함)
            내부 방침 및 기타 관련 법령에 의한 정보보호 사유에 따라(보유 및 이용기간 참조) 일정 기간 저장된 후 파기되어집니다.
          </p>
          <p>
            별도 DB로 옮겨진 개인정보는 법률에 의한 경우가 아니고서는 보유되어지는 이외의 다른 목적으로 이용되지 않습니다.
          </p>
          <p className="font-medium">ο 파기방법</p>
          <p>- 전자적 파일형태로 저장된 개인정보는 기록을 재생할 수 없는 기술적 방법을 사용하여 삭제합니다.</p>

          <h3 className="font-bold text-base">■ 개인정보 제공</h3>
          <p>회사는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다. 다만, 아래의 경우에는 예외로 합니다.</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>이용자들이 사전에 동의한 경우</li>
            <li>법령의 규정에 의거하거나, 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우</li>
          </ul>

          <h3 className="font-bold text-base">■ 제3자에 대한 제공 및 수집한 개인정보의 위탁</h3>
          <p>
            1. 회사는 고객의 개인정보를 &apos;개인정보의 수집 및 이용목적&apos;에서 고지한 범위를 넘어
            이용하거나 타인 또는 타기업, 기관에 제공하지 않습니다.
          </p>
          <p>2. 다음은 예외로 합니다.</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>(가) 관계법령에 의하여 수사상의 목적으로 관계기관으로부터의 요구가 있을 경우</li>
            <li>(나) 통계작성, 학술연구나 시장조사 등을 위하여 특정 개인을 식별할 수 없는 형태로 광고주, 협력사나 연구단체 등에 제공하는 경우</li>
            <li>(다) 기타 관계법령에서 정한 절차에 따른 요청이 있는 경우</li>
          </ul>
          <p>
            상기사항에 의해 개인정보를 제공하는 경우에도 본래의 수집·이용 목적에 반하여 무분별하게 정보가 제공되지 않도록
            최대한 노력하겠으며 보다 나은 서비스 제공, 고객편의 제공 등 원활한 업무 수행을 위하여 아래와 같이
            개인정보 처리 업무를 외부 전문업체에 위탁하여 운영하고 있습니다.
          </p>

          <h4 className="font-medium">위탁업무 내용 및 수탁자</h4>
          <ul className="list-disc pl-5 space-y-1">
            <li>전산 시스템 구축 및 유지: (주)아임웹</li>
            <li>카카오알림톡/문자메시지 발송: (주)아임웹, (주)써머스플랫폼</li>
            <li>본인확인: KG 이니시스</li>
            <li>결제 및 에스크로 서비스: 나이스페이먼츠</li>
          </ul>
          <p className="text-gray-500 text-xs">
            ※ 수탁자에 공유되는 정보는 당해 목적을 달성하기 위하여 필요한 최소한의 정보에 국한됩니다.
            또한 고객의 서비스 요청에 따라 해당하는 업체에 선택적으로 개인정보가 제공되고 있습니다.
          </p>
          <p className="text-gray-500 text-xs">
            ※ 위탁 업체 리스트는 해당 서비스 변경 및 계약기간에 따라 변경될 수 있으며 변경 시 공지사항을 통해 사전 공지합니다.
            단기 이벤트는 참여 시에 개별 공지됩니다.
          </p>

          <h3 className="font-bold text-base">■ 14세 미만 아동의 개인정보보호</h3>
          <p>회사는 법정대리인의 동의가 필요한 만 14세 미만 아동의 회원가입은 받고 있지 않습니다.</p>

          <h3 className="font-bold text-base">■ 개인정보 자동수집 장치의 설치, 운영 및 그 거부에 관한 사항</h3>
          <p>
            회사는 귀하의 정보를 수시로 저장하고 찾아내는 &apos;쿠키(cookie)&apos; 등을 운용합니다.
            쿠키란 회사의 웹사이트를 운영하는데 이용되는 서버가 귀하의 브라우저에 보내는 아주 작은 텍스트 파일로서
            귀하의 컴퓨터 하드디스크에 저장됩니다. 회사는 다음과 같은 목적을 위해 쿠키를 사용합니다.
          </p>
          <p className="font-medium">▶ 쿠키 등 사용 목적</p>
          <p>
            - 회원과 비회원의 접속 빈도나 방문 시간 등을 분석, 이용자의 취향과 관심분야를 파악 및 자취 추적,
            각종 이벤트 참여 정도 및 방문 회수 파악 등을 통한 타겟 마케팅 및 개인 맞춤 서비스 제공
          </p>
          <p>
            귀하는 쿠키 설치에 대한 선택권을 가지고 있습니다. 따라서, 귀하는 웹브라우저에서 옵션을 설정함으로써
            모든 쿠키를 허용하거나, 쿠키가 저장될 때마다 확인을 거치거나, 아니면 모든 쿠키의 저장을 거부할 수도 있습니다.
          </p>
          <p className="font-medium">▶ 쿠키 설정 거부 방법</p>
          <p>
            쿠키 설정을 거부하는 방법으로는 회원님이 사용하시는 웹 브라우저의 옵션을 선택함으로써
            모든 쿠키를 허용하거나 쿠키를 저장할 때마다 확인을 거치거나, 모든 쿠키의 저장을 거부할 수 있습니다.
          </p>
          <p>
            설정방법 예(인터넷 익스플로어의 경우): 웹 브라우저 상단의 도구 &gt; 인터넷 옵션 &gt; 개인정보
          </p>
          <p className="text-gray-500 text-xs">
            단, 귀하께서 쿠키 설치를 거부하였을 경우 서비스 제공에 어려움이 있을 수 있습니다.
          </p>

          <h3 className="font-bold text-base">■ 개인정보에 관한 민원서비스</h3>
          <p>
            회사는 고객의 개인정보를 보호하고 개인정보와 관련한 불만을 처리하기 위하여
            아래와 같이 관련 부서 및 개인정보관리책임자를 지정하고 있습니다.
          </p>

          <h3 className="font-bold text-base">■ 개인정보처리방침의 개정과 그 공지</h3>
          <p>
            본 개인정보 처리방침을 개정할 경우에는 최소 7일전에 홈페이지 또는 이메일을 통해 변경 및 내용 등을 공지하도록 하겠습니다.
            다만 이용자의 소중한 권리 또는 의무에 중요한 내용 변경이 발생하는 경우 시행일로부터 최소 30일 전에 공지하도록 하겠습니다.
          </p>

          <div className="bg-gray-50 p-4 rounded-lg space-y-1">
            <p className="font-medium">개인정보관리책임자</p>
            <p>성명 : 김채윤</p>
            <p>전화번호 : 070-4138-0625</p>
            <p>이메일 : soluto@soluto.dooray.com</p>
          </div>

          <p>
            귀하께서는 회사의 서비스를 이용하시며 발생하는 모든 개인정보보호 관련 민원을
            개인정보관리책임자 혹은 담당부서로 신고하실 수 있습니다.
            회사는 이용자들의 신고사항에 대해 신속하게 충분한 답변을 드릴 것입니다.
          </p>

          <p>기타 개인정보침해에 대한 신고나 상담이 필요하신 경우에는 아래 기관에 문의하시기 바랍니다.</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>대검찰청 사이버수사과 (cybercid.spo.go.kr)</li>
            <li>경찰청 사이버테러대응센터 (www.ctrc.go.kr / 02-392-0330)</li>
            <li>개인정보침해신고센터 (privacy.kisa.or.kr / 국번 없이 118)</li>
            <li>개인정보분쟁조정위원회 (kopico.go.kr / 1833-6972)</li>
          </ul>
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
