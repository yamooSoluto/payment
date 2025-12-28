'use client';

import { useState, useEffect } from 'react';
import { Bell, Plus, EditPencil, Trash, RefreshDouble, Xmark, Flash } from 'iconoir-react';

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

const TRIGGER_EVENTS = [
  { value: '', label: '수동 발송' },
  { value: 'payment_success', label: '결제 완료' },
  { value: 'payment_failed', label: '결제 실패' },
  { value: 'subscription_canceled', label: '구독 해지' },
  { value: 'trial_ending', label: '체험 종료 임박' },
  { value: 'subscription_renewed', label: '구독 갱신' },
];

export default function NotificationsPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    content: '',
    variables: '',
    triggerEvent: '',
    isActive: true,
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/admin/notifications');
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates);
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (template?: Template) => {
    if (template) {
      setEditingTemplate(template);
      setFormData({
        code: template.code,
        name: template.name,
        content: template.content,
        variables: template.variables?.join(', ') || '',
        triggerEvent: template.triggerEvent || '',
        isActive: template.isActive,
      });
    } else {
      setEditingTemplate(null);
      setFormData({
        code: '',
        name: '',
        content: '',
        variables: '',
        triggerEvent: '',
        isActive: true,
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingTemplate(null);
  };

  const handleSave = async () => {
    if (!formData.code || !formData.name) {
      alert('템플릿 코드와 이름은 필수입니다.');
      return;
    }

    setSaving(true);
    try {
      const url = editingTemplate
        ? `/api/admin/notifications/${editingTemplate.id}`
        : '/api/admin/notifications';

      const body = {
        ...formData,
        variables: formData.variables
          .split(',')
          .map(v => v.trim())
          .filter(v => v),
        triggerEvent: formData.triggerEvent || null,
      };

      const response = await fetch(url, {
        method: editingTemplate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        handleCloseModal();
        fetchTemplates();
      } else {
        const data = await response.json();
        alert(data.error || '저장에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to save template:', error);
      alert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (template: Template) => {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">알림톡</h1>
        </div>
        <button
          onClick={() => handleOpenModal()}
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
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RefreshDouble className="w-8 h-8 text-blue-600 animate-spin" />
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
                          onClick={() => handleOpenModal(template)}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          title="수정"
                        >
                          <EditPencil className="w-4 h-4 text-gray-500" />
                        </button>
                        <button
                          onClick={() => handleDelete(template)}
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

      {/* 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">
                {editingTemplate ? '템플릿 수정' : '템플릿 추가'}
              </h2>
              <button
                onClick={handleCloseModal}
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
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
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
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="결제 완료 알림"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  발송 트리거
                </label>
                <select
                  value={formData.triggerEvent}
                  onChange={(e) => setFormData({ ...formData, triggerEvent: e.target.value })}
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
                  value={formData.variables}
                  onChange={(e) => setFormData({ ...formData, variables: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="#{이름}, #{금액}, #{플랜}"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  템플릿 내용 (미리보기용)
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  rows={5}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="안녕하세요 #{이름}님,&#10;결제가 완료되었습니다.&#10;금액: #{금액}원"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    formData.isActive ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      formData.isActive ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className="text-sm text-gray-700">활성화</span>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCloseModal}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving ? <RefreshDouble className="w-5 h-5 animate-spin mx-auto" /> : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
