'use client';

import { useState, useEffect, useCallback } from 'react';
import { Mail, Plus, EditPencil, Trash, RefreshDouble, Xmark, Flash, Send, Clock, NavArrowLeft, NavArrowRight, Search } from 'iconoir-react';
import Spinner from '@/components/admin/Spinner';
import { MEMBER_GROUP_OPTIONS, MEMBER_GROUPS, MemberGroupCode } from '@/lib/constants';

// ===== 인터페이스 =====
interface Template {
  id: string;
  code: string;
  name: string;
  content: string;
  variables: string[];
  triggerEvent: string | null;
  isActive: boolean;
  createdAt: string;
}


interface SmsHistory {
  id: string;
  type: 'SMS' | 'LMS';
  message: string;
  recipients: string[];
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  sentBy: string;
  sentByName: string;
  sentAt: string;
  scheduledAt?: string;
}

interface SearchedMember {
  id: string;
  email: string;
  name: string;
  phone: string;
}

// ===== 상수 =====
const TRIGGER_EVENTS = [
  { value: '', label: '수동 발송' },
  { value: 'payment_success', label: '결제 완료' },
  { value: 'payment_failed', label: '결제 실패' },
  { value: 'subscription_canceled', label: '구독 해지' },
  { value: 'trial_ending', label: '체험 종료 임박' },
  { value: 'subscription_renewed', label: '구독 갱신' },
];

// 구독 상태 옵션
const SUBSCRIPTION_STATUS_OPTIONS = [
  { id: 'active', name: '구독중' },
  { id: 'trial', name: '체험중' },
  { id: 'expired', name: '만료' },
  { id: 'canceled', name: '해지' },
  { id: 'none', name: '미구독' },
];

export default function NotificationsPage() {
  // 탭 상태
  const [activeTab, setActiveTab] = useState<'sms' | 'alimtalk'>('sms');

  // ===== SMS 관련 상태 =====
  const [smsHistory, setSmsHistory] = useState<SmsHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [smsSending, setSmsSending] = useState(false);
  const [smsForm, setSmsForm] = useState({
    sendType: 'group' as 'group' | 'search' | 'direct',
    selectedGroups: [] as string[],      // 회원 그룹 (일반, 내부 등)
    selectedStatuses: [] as string[],    // 구독 상태 (active, trial 등)
    phones: '',
    subject: '',
    message: '',
    isScheduled: false,
    scheduledAt: '',
  });

  // 회원 검색 관련 상태
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState<SearchedMember[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<SearchedMember[]>([]);
  const [memberSearching, setMemberSearching] = useState(false);

  // SMS 미리보기 모달 상태
  const [showSmsPreview, setShowSmsPreview] = useState(false);
  const [previewPhoneCount, setPreviewPhoneCount] = useState(0);
  const [previewTargets, setPreviewTargets] = useState<{ email: string; name: string; phone: string }[]>([]);

  // ===== 알림톡 관련 상태 =====
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateLoading, setTemplateLoading] = useState(true);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateForm, setTemplateForm] = useState({
    code: '',
    name: '',
    content: '',
    variables: '',
    triggerEvent: '',
    isActive: true,
  });

  // ===== 데이터 페칭 =====
  const fetchSmsHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch(`/api/admin/sms-history?page=${historyPage}&limit=10`);
      if (response.ok) {
        const data = await response.json();
        setSmsHistory(data.history || []);
        setHistoryTotal(data.total || 0);
      }
    } catch (error) {
      console.error('Failed to fetch SMS history:', error);
    } finally {
      setHistoryLoading(false);
    }
  }, [historyPage]);

  const fetchTemplates = useCallback(async () => {
    setTemplateLoading(true);
    try {
      const response = await fetch('/api/admin/notifications');
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    } finally {
      setTemplateLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'sms') {
      fetchSmsHistory();
    } else {
      fetchTemplates();
    }
  }, [activeTab, fetchSmsHistory, fetchTemplates]);

  // ===== SMS 핸들러 =====
  const handleSearchMembers = async () => {
    if (!memberSearchQuery.trim()) return;

    setMemberSearching(true);
    try {
      const response = await fetch(`/api/admin/members?search=${encodeURIComponent(memberSearchQuery)}&limit=10`);
      if (response.ok) {
        const data = await response.json();
        const results = (data.members || []).map((m: { id: string; email: string; name: string; phone: string }) => ({
          id: m.id,
          email: m.email,
          name: m.name,
          phone: m.phone,
        }));
        setMemberSearchResults(results);
      }
    } catch (error) {
      console.error('Failed to search members:', error);
    } finally {
      setMemberSearching(false);
    }
  };

  const handleSelectMember = (member: SearchedMember) => {
    if (!selectedMembers.find(m => m.id === member.id)) {
      setSelectedMembers(prev => [...prev, member]);
    }
    setMemberSearchResults([]);
    setMemberSearchQuery('');
  };

  const handleRemoveMember = (memberId: string) => {
    setSelectedMembers(prev => prev.filter(m => m.id !== memberId));
  };

  // 미리보기 열기 (발송 전 확인)
  const handleOpenPreview = async () => {
    // 유효성 검사
    if (!smsForm.message.trim()) {
      alert('메시지 내용을 입력해주세요.');
      return;
    }

    let phoneCount = 0;
    let targets: { email: string; name: string; phone: string }[] = [];

    if (smsForm.sendType === 'group') {
      if (smsForm.selectedGroups.length === 0 && smsForm.selectedStatuses.length === 0) {
        alert('회원 그룹 또는 구독 상태를 선택해주세요.');
        return;
      }
      // 수신자 정보 조회
      try {
        const response = await fetch('/api/admin/members/by-groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            groupIds: smsForm.selectedGroups,
            statuses: smsForm.selectedStatuses,
          }),
        });
        if (response.ok) {
          const data = await response.json();
          phoneCount = data.count || 0;
          targets = data.members || [];
        }
      } catch (error) {
        console.error('Failed to fetch group members:', error);
        alert('수신자 정보를 불러오는데 실패했습니다.');
        return;
      }
    } else if (smsForm.sendType === 'search') {
      if (selectedMembers.length === 0) {
        alert('발송할 회원을 선택해주세요.');
        return;
      }
      targets = selectedMembers.filter(m => m.phone).map(m => ({
        email: m.email,
        name: m.name,
        phone: m.phone,
      }));
      phoneCount = targets.length;
    } else {
      const phones = smsForm.phones.split(/[,\n]/).map(p => p.trim()).filter(p => p);
      targets = phones.map(phone => ({ email: '', name: '', phone }));
      phoneCount = phones.length;
    }

    if (phoneCount === 0) {
      alert('발송할 수신자가 없습니다.');
      return;
    }

    setPreviewPhoneCount(phoneCount);
    setPreviewTargets(targets);
    setShowSmsPreview(true);
  };

  const handleSendSms = async () => {
    setShowSmsPreview(false);
    let phones: string[] = [];

    if (smsForm.sendType === 'group') {
      // 그룹/상태의 회원 전화번호 조회
      try {
        const response = await fetch('/api/admin/members/by-groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            groupIds: smsForm.selectedGroups,
            statuses: smsForm.selectedStatuses,
          }),
        });
        if (response.ok) {
          const data = await response.json();
          phones = data.phones || [];
        }
      } catch (error) {
        console.error('Failed to fetch group members:', error);
        alert('그룹 회원 정보를 불러오는데 실패했습니다.');
        return;
      }
    } else if (smsForm.sendType === 'search') {
      if (selectedMembers.length === 0) {
        alert('발송할 회원을 선택해주세요.');
        return;
      }
      phones = selectedMembers.map(m => m.phone).filter(p => p);
    } else {
      phones = smsForm.phones
        .split(/[,\n]/)
        .map(p => p.trim())
        .filter(p => p);
    }

    if (phones.length === 0) {
      alert('발송할 전화번호가 없습니다.');
      return;
    }

    setSmsSending(true);
    try {
      const response = await fetch('/api/admin/members/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phones,
          message: smsForm.message,
          subject: smsForm.subject || undefined,
          scheduledAt: smsForm.isScheduled ? smsForm.scheduledAt : undefined,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        alert(data.message || 'SMS가 발송되었습니다.');
        setSmsForm({
          sendType: 'group',
          selectedGroups: [],
          selectedStatuses: [],
          phones: '',
          subject: '',
          message: '',
          isScheduled: false,
          scheduledAt: '',
        });
        setSelectedMembers([]);
        setMemberSearchQuery('');
        setMemberSearchResults([]);
        fetchSmsHistory();
      } else {
        const data = await response.json();
        alert(data.error || 'SMS 발송에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to send SMS:', error);
      alert('SMS 발송에 실패했습니다.');
    } finally {
      setSmsSending(false);
    }
  };

  const handleGroupToggle = (groupId: string) => {
    setSmsForm(prev => ({
      ...prev,
      selectedGroups: prev.selectedGroups.includes(groupId)
        ? prev.selectedGroups.filter(id => id !== groupId)
        : [...prev.selectedGroups, groupId],
    }));
  };

  const handleStatusToggle = (statusId: string) => {
    setSmsForm(prev => ({
      ...prev,
      selectedStatuses: prev.selectedStatuses.includes(statusId)
        ? prev.selectedStatuses.filter(id => id !== statusId)
        : [...prev.selectedStatuses, statusId],
    }));
  };

  // ===== 알림톡 핸들러 =====
  const handleOpenTemplateModal = (template?: Template) => {
    if (template) {
      setEditingTemplate(template);
      setTemplateForm({
        code: template.code,
        name: template.name,
        content: template.content,
        variables: template.variables?.join(', ') || '',
        triggerEvent: template.triggerEvent || '',
        isActive: template.isActive,
      });
    } else {
      setEditingTemplate(null);
      setTemplateForm({
        code: '',
        name: '',
        content: '',
        variables: '',
        triggerEvent: '',
        isActive: true,
      });
    }
    setShowTemplateModal(true);
  };

  const handleSaveTemplate = async () => {
    if (!templateForm.code || !templateForm.name) {
      alert('템플릿 코드와 이름은 필수입니다.');
      return;
    }

    setTemplateSaving(true);
    try {
      const url = editingTemplate
        ? `/api/admin/notifications/${editingTemplate.id}`
        : '/api/admin/notifications';

      const body = {
        ...templateForm,
        variables: templateForm.variables
          .split(',')
          .map(v => v.trim())
          .filter(v => v),
        triggerEvent: templateForm.triggerEvent || null,
      };

      const response = await fetch(url, {
        method: editingTemplate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        setShowTemplateModal(false);
        setEditingTemplate(null);
        fetchTemplates();
      } else {
        const data = await response.json();
        alert(data.error || '저장에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to save template:', error);
      alert('저장에 실패했습니다.');
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleDeleteTemplate = async (template: Template) => {
    if (!confirm(`정말 "${template.name}" 템플릿을 삭제하시겠습니까?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/notifications/${template.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchTemplates();
      } else {
        const data = await response.json();
        alert(data.error || '삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to delete template:', error);
      alert('삭제에 실패했습니다.');
    }
  };

  const getTriggerLabel = (triggerEvent: string | null) => {
    const event = TRIGGER_EVENTS.find(e => e.value === triggerEvent);
    return event?.label || '수동 발송';
  };

  const historyTotalPages = Math.ceil(historyTotal / 10);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Mail className="w-8 h-8 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">메시지</h1>
      </div>

      {/* 탭 */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-8">
          <button
            onClick={() => setActiveTab('sms')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'sms'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            SMS
          </button>
          <button
            onClick={() => setActiveTab('alimtalk')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'alimtalk'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            알림톡
          </button>
        </nav>
      </div>

      {/* SMS 탭 */}
      {activeTab === 'sms' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* SMS 발송 폼 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">SMS 발송</h2>

            {/* 발송 유형 선택 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">발송 유형</label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={smsForm.sendType === 'group'}
                    onChange={() => setSmsForm(prev => ({ ...prev, sendType: 'group' }))}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm">그룹에게 발송</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={smsForm.sendType === 'search'}
                    onChange={() => setSmsForm(prev => ({ ...prev, sendType: 'search' }))}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm">회원 검색</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={smsForm.sendType === 'direct'}
                    onChange={() => setSmsForm(prev => ({ ...prev, sendType: 'direct' }))}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm">번호 직접 입력</span>
                </label>
              </div>
            </div>

            {/* 그룹/상태 선택 */}
            {smsForm.sendType === 'group' && (
              <div className="space-y-4 mb-4">
                {/* 회원 그룹 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">회원 그룹</label>
                  <div className="flex flex-wrap gap-2">
                    {MEMBER_GROUP_OPTIONS.map(group => (
                      <button
                        key={group.value}
                        onClick={() => handleGroupToggle(group.value)}
                        className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                          smsForm.selectedGroups.includes(group.value)
                            ? group.value === 'internal'
                              ? 'bg-purple-600 text-white border-purple-600'
                              : 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
                        }`}
                      >
                        {group.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 구독 상태 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">구독 상태</label>
                  <div className="flex flex-wrap gap-2">
                    {SUBSCRIPTION_STATUS_OPTIONS.map(status => (
                      <button
                        key={status.id}
                        onClick={() => handleStatusToggle(status.id)}
                        className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                          smsForm.selectedStatuses.includes(status.id)
                            ? 'bg-green-600 text-white border-green-600'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-green-300'
                        }`}
                      >
                        {status.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 선택 안내 */}
                {(smsForm.selectedGroups.length > 0 || smsForm.selectedStatuses.length > 0) && (
                  <p className="text-xs text-gray-500">
                    {smsForm.selectedGroups.length > 0 && smsForm.selectedStatuses.length > 0
                      ? '선택한 그룹 중 선택한 상태에 해당하는 회원에게 발송됩니다.'
                      : smsForm.selectedGroups.length > 0
                        ? '선택한 그룹의 모든 회원에게 발송됩니다.'
                        : '선택한 상태의 모든 회원에게 발송됩니다.'}
                  </p>
                )}
              </div>
            )}

            {/* 회원 검색 */}
            {smsForm.sendType === 'search' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">회원 검색</label>
                <div className="relative">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={memberSearchQuery}
                      onChange={(e) => setMemberSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchMembers()}
                      placeholder="이름, 이메일, 전화번호로 검색"
                      className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={handleSearchMembers}
                      disabled={memberSearching}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                    >
                      {memberSearching ? (
                        <RefreshDouble className="w-5 h-5 animate-spin" />
                      ) : (
                        <Search className="w-5 h-5" />
                      )}
                    </button>
                  </div>

                  {/* 검색 결과 드롭다운 */}
                  {memberSearchResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {memberSearchResults.map((member) => (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => handleSelectMember(member)}
                          disabled={!member.phone}
                          className="w-full px-4 py-2 text-left hover:bg-gray-50 transition-colors flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <div>
                            <p className="text-sm font-medium text-gray-900">{member.name || '이름 없음'}</p>
                            <p className="text-xs text-gray-500">{member.email}</p>
                          </div>
                          <span className="text-xs text-gray-400">
                            {member.phone || '전화번호 없음'}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 선택된 회원 목록 */}
                {selectedMembers.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-gray-500 mb-2">선택된 회원 ({selectedMembers.length}명)</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedMembers.map((member) => (
                        <span
                          key={member.id}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-sm"
                        >
                          {member.name || member.email}
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(member.id)}
                            className="p-0.5 hover:bg-blue-100 rounded-full"
                          >
                            <Xmark className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 번호 직접 입력 */}
            {smsForm.sendType === 'direct' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">전화번호</label>
                <textarea
                  value={smsForm.phones}
                  onChange={(e) => setSmsForm(prev => ({ ...prev, phones: e.target.value }))}
                  rows={3}
                  placeholder="전화번호를 입력하세요 (쉼표 또는 줄바꿈으로 구분)"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            )}

            {/* 제목 (LMS용) */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                제목 <span className="text-gray-400 font-normal">(LMS 전용, 선택)</span>
              </label>
              <input
                type="text"
                value={smsForm.subject}
                onChange={(e) => setSmsForm(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="LMS 발송 시 제목"
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* 메시지 내용 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">메시지 내용</label>
              <textarea
                value={smsForm.message}
                onChange={(e) => setSmsForm(prev => ({ ...prev, message: e.target.value }))}
                rows={5}
                placeholder="메시지를 입력하세요"
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <p className="text-xs text-gray-500 mt-1">
                {smsForm.message.length}/90자 {smsForm.message.length > 90 && '(LMS로 발송됩니다)'}
              </p>
            </div>

            {/* 예약 발송 */}
            <div className="mb-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={smsForm.isScheduled}
                  onChange={(e) => setSmsForm(prev => ({ ...prev, isScheduled: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm font-medium text-gray-700">예약 발송</span>
              </label>
              {smsForm.isScheduled && (
                <input
                  type="datetime-local"
                  value={smsForm.scheduledAt}
                  onChange={(e) => setSmsForm(prev => ({ ...prev, scheduledAt: e.target.value }))}
                  className="mt-2 w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>

            {/* 발송 버튼 */}
            <button
              onClick={handleOpenPreview}
              disabled={smsSending}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {smsSending ? (
                <Spinner size="sm" />
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  발송하기
                </>
              )}
            </button>
          </div>

          {/* 발송 내역 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">발송 내역</h2>

            {historyLoading ? (
              <div className="flex items-center justify-center py-10">
                <Spinner size="md" />
              </div>
            ) : smsHistory.length === 0 ? (
              <div className="text-center py-10 text-gray-500">
                발송 내역이 없습니다.
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {smsHistory.map((item) => (
                    <div key={item.id} className="border border-gray-100 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                            item.type === 'LMS' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {item.type}
                          </span>
                          {item.scheduledAt && (
                            <span className="flex items-center gap-1 text-xs text-orange-600">
                              <Clock className="w-3 h-3" />
                              예약
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500">
                          {new Date(item.sentAt).toLocaleString('ko-KR')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-900 line-clamp-2 mb-2">{item.message}</p>
                      <div className="flex flex-col gap-1 text-xs text-gray-500">
                        <div className="flex items-center justify-between">
                          <span>발신: {item.sentByName || item.sentBy || '시스템'}</span>
                          <span>
                            성공 {item.sentCount}
                            {item.failedCount > 0 && <span className="text-red-500"> / 실패 {item.failedCount}</span>}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>수신: {item.recipientCount}명</span>
                          {item.recipients && item.recipients.length > 0 && (
                            <span className="text-gray-400 truncate max-w-[150px]" title={item.recipients.join(', ')}>
                              {item.recipients.slice(0, 2).join(', ')}{item.recipients.length > 2 && ` 외 ${item.recipients.length - 2}명`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 페이지네이션 */}
                {historyTotalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-gray-100">
                    <button
                      onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                      disabled={historyPage === 1}
                      className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <NavArrowLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm text-gray-600">
                      {historyPage} / {historyTotalPages}
                    </span>
                    <button
                      onClick={() => setHistoryPage(p => Math.min(historyTotalPages, p + 1))}
                      disabled={historyPage === historyTotalPages}
                      className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <NavArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 알림톡 탭 */}
      {activeTab === 'alimtalk' && (
        <>
          {/* 상단 버튼 */}
          <div className="flex justify-end">
            <button
              onClick={() => handleOpenTemplateModal()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              템플릿 추가
            </button>
          </div>

          {/* 안내 */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              <strong>비즈엠 연동 안내:</strong> 알림톡 발송을 위해서는 비즈엠 API 연동이 필요합니다.
              템플릿 코드는 비즈엠에서 승인받은 템플릿 코드를 입력해주세요.
            </p>
          </div>

          {/* 템플릿 목록 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {templateLoading ? (
              <div className="flex items-center justify-center py-20">
                <Spinner size="md" />
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-20 text-gray-500">
                등록된 템플릿이 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-max">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">템플릿 코드</th>
                      <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">이름</th>
                      <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">발송 트리거</th>
                      <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">변수</th>
                      <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">상태</th>
                      <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {templates.map((template) => (
                      <tr key={template.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-sm font-mono text-gray-900">
                          {template.code}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {template.name}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {template.triggerEvent ? (
                            <span className="flex items-center gap-1 text-blue-600">
                              <Flash className="w-4 h-4" />
                              {getTriggerLabel(template.triggerEvent)}
                            </span>
                          ) : (
                            <span className="text-gray-500">수동 발송</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {template.variables?.length > 0
                            ? template.variables.join(', ')
                            : '-'}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {template.isActive ? (
                            <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">활성</span>
                          ) : (
                            <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-500 rounded-full">비활성</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleOpenTemplateModal(template)}
                              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                              title="수정"
                            >
                              <EditPencil className="w-4 h-4 text-gray-500" />
                            </button>
                            <button
                              onClick={() => handleDeleteTemplate(template)}
                              className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                              title="삭제"
                            >
                              <Trash className="w-4 h-4 text-red-500" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* 템플릿 모달 */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">
                {editingTemplate ? '템플릿 수정' : '템플릿 추가'}
              </h2>
              <button
                onClick={() => setShowTemplateModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <Xmark className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  템플릿 코드 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={templateForm.code}
                  onChange={(e) => setTemplateForm({ ...templateForm, code: e.target.value })}
                  disabled={!!editingTemplate}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 font-mono"
                  placeholder="비즈엠 템플릿 코드"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  템플릿 이름 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="결제 완료 알림"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  발송 트리거
                </label>
                <select
                  value={templateForm.triggerEvent}
                  onChange={(e) => setTemplateForm({ ...templateForm, triggerEvent: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {TRIGGER_EVENTS.map((event) => (
                    <option key={event.value} value={event.value}>
                      {event.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  트리거를 선택하면 해당 이벤트 발생 시 자동으로 발송됩니다.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  변수 (쉼표로 구분)
                </label>
                <input
                  type="text"
                  value={templateForm.variables}
                  onChange={(e) => setTemplateForm({ ...templateForm, variables: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="#{이름}, #{금액}, #{플랜}"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  템플릿 내용 (미리보기용)
                </label>
                <textarea
                  value={templateForm.content}
                  onChange={(e) => setTemplateForm({ ...templateForm, content: e.target.value })}
                  rows={5}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="안녕하세요 #{이름}님,&#10;결제가 완료되었습니다.&#10;금액: #{금액}원"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTemplateForm({ ...templateForm, isActive: !templateForm.isActive })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    templateForm.isActive ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      templateForm.isActive ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className="text-sm text-gray-700">활성화</span>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowTemplateModal(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={templateSaving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {templateSaving ? <Spinner size="sm" /> : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SMS 미리보기 모달 */}
      {showSmsPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">발송 확인</h2>
              <button
                onClick={() => setShowSmsPreview(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <Xmark className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* 메시지 미리보기 */}
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">메시지 내용</label>
                <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-900 whitespace-pre-wrap">
                  {smsForm.subject && <p className="font-medium mb-2">[{smsForm.subject}]</p>}
                  {smsForm.message}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {smsForm.message.length}자 ({smsForm.message.length > 90 ? 'LMS' : 'SMS'})
                </p>
              </div>

              {/* 수신자 목록 */}
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  수신자 목록 ({previewPhoneCount}명)
                </label>
                <div className="bg-gray-50 rounded-lg p-3 max-h-40 overflow-y-auto">
                  {previewTargets.length > 0 ? (
                    <div className="space-y-1">
                      {previewTargets.map((target, index) => (
                        <div key={index} className="flex items-center justify-between text-sm py-1 border-b border-gray-100 last:border-0">
                          <span className="text-gray-900">
                            {target.name || target.email || '이름 없음'}
                          </span>
                          <span className="text-gray-500 font-mono text-xs">
                            {target.phone}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-2">수신자 정보 없음</p>
                  )}
                </div>
              </div>

              {/* 발송 정보 */}
              <div className="bg-blue-50 rounded-lg p-4 space-y-2">
                {smsForm.isScheduled && smsForm.scheduledAt && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">예약 시간</span>
                    <span className="font-medium text-orange-600">
                      {new Date(smsForm.scheduledAt).toLocaleString('ko-KR')}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">발송 유형</span>
                  <span className="font-medium text-blue-700">
                    {smsForm.message.length > 90 ? 'LMS' : 'SMS'}
                  </span>
                </div>
              </div>

              {/* 경고 문구 */}
              <p className="text-xs text-gray-500 text-center">
                발송 후에는 취소할 수 없습니다. 내용을 다시 한번 확인해주세요.
              </p>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowSmsPreview(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSendSms}
                disabled={smsSending}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {smsSending ? (
                  <Spinner size="sm" />
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    발송하기
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
