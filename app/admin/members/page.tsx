'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Search, NavArrowLeft, NavArrowRight, NavArrowUp, NavArrowDown, Group, RefreshDouble, Plus, Xmark, MoreHoriz, Trash, MessageText, Download, Filter, Eye, EyeClosed } from 'iconoir-react';
import Spinner from '@/components/admin/Spinner';
import { MEMBER_GROUPS, MEMBER_GROUP_OPTIONS } from '@/lib/constants';

const fetcher = (url: string) => fetch(url).then(res => res.json());

interface TenantInfo {
  tenantId: string;
  brandName: string;
  plan: string;
  status: string;
}

interface Member {
  id: string;
  email: string;
  name: string;
  phone: string;
  tenants: TenantInfo[];
  tenantCount: number;
  createdAt: string;
  group?: string;
  totalPaymentAmount?: number;
  deletedAt?: string;
  retentionEndDate?: string;
  retentionReason?: string;
}

interface MemberGroup {
  id: string;
  name: string;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function MembersPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    passwordConfirm: '',
    name: '',
    phone: '',
    group: 'normal',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

  // 선택 관련 상태
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);
  const [actionMenuPosition, setActionMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);

  // 모달 상태
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [groups, setGroups] = useState<MemberGroup[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [smsMessage, setSmsMessage] = useState('');
  const [deleteTargets, setDeleteTargets] = useState<string[]>([]);
  const [smsTargets, setSmsTargets] = useState<Member[]>([]);

  // 필터 상태
  const [filterGroup, setFilterGroup] = useState<string[]>([]);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // 탭 상태
  const [activeTab, setActiveTab] = useState<'active' | 'deleted'>('active');

  // 정렬 상태
  const [sortField, setSortField] = useState<'createdAt' | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const membersApiUrl = `/api/admin/members?${new URLSearchParams({
    page: pagination.page.toString(),
    limit: pagination.limit.toString(),
    status: activeTab,
    ...(search && { search }),
  })}`;

  const { data: membersData, isLoading: loading, mutate: mutateMembers } = useSWR(
    membersApiUrl,
    fetcher,
    { keepPreviousData: true }
  );

  const members: Member[] = membersData?.members || [];

  useEffect(() => {
    if (membersData?.pagination) {
      setPagination(membersData.pagination);
    }
  }, [membersData]);

  const handleTabChange = (tab: 'active' | 'deleted') => {
    setActiveTab(tab);
    setPagination(prev => ({ ...prev, page: 1 }));
    setSelectedMembers(new Set());
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination(prev => ({ ...prev, page: 1 }));
    mutateMembers();
  };

  const handleOpenModal = () => {
    setFormData({
      email: '',
      password: '',
      passwordConfirm: '',
      name: '',
      phone: '',
      group: 'normal',
    });
    setShowPassword(false);
    setShowPasswordConfirm(false);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
  };

  const handleSave = async () => {
    if (!formData.email) {
      alert('이메일은 필수입니다.');
      return;
    }
    if (!formData.password) {
      alert('비밀번호는 필수입니다.');
      return;
    }
    if (formData.password.length < 6) {
      alert('비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    if (formData.password !== formData.passwordConfirm) {
      alert('비밀번호가 일치하지 않습니다.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/admin/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        handleCloseModal();
        mutateMembers();
      } else {
        const data = await response.json();
        alert(data.error || '저장에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to save member:', error);
      alert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // 전체 선택/해제
  const handleSelectAll = () => {
    if (selectedMembers.size === members.length) {
      setSelectedMembers(new Set());
    } else {
      setSelectedMembers(new Set(members.map(m => m.id)));
    }
  };

  // 개별 선택/해제
  const handleSelectMember = (memberId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelected = new Set(selectedMembers);
    if (newSelected.has(memberId)) {
      newSelected.delete(memberId);
    } else {
      newSelected.add(memberId);
    }
    setSelectedMembers(newSelected);
  };

  // 그룹 목록 가져오기
  const fetchGroups = async () => {
    try {
      const response = await fetch('/api/admin/member-groups');
      if (response.ok) {
        const data = await response.json();
        setGroups(data.groups || []);
      }
    } catch (error) {
      console.error('Failed to fetch groups:', error);
    }
  };

  // 그룹 지정 모달 열기
  const handleOpenGroupModal = () => {
    if (selectedMembers.size === 0) {
      alert('회원을 선택해주세요.');
      return;
    }
    fetchGroups();
    setShowGroupModal(true);
  };

  // 새 그룹 생성
  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      alert('그룹명을 입력해주세요.');
      return;
    }
    try {
      const response = await fetch('/api/admin/member-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newGroupName }),
      });
      if (response.ok) {
        const data = await response.json();
        setGroups([...groups, data.group]);
        setSelectedGroup(data.group.id);
        setNewGroupName('');
      } else {
        const data = await response.json();
        alert(data.error || '그룹 생성에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to create group:', error);
    }
  };

  // 그룹 지정 저장
  const handleAssignGroup = async () => {
    if (!selectedGroup) {
      alert('그룹을 선택해주세요.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/admin/members/assign-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberIds: Array.from(selectedMembers),
          group: selectedGroup,
        }),
      });
      if (response.ok) {
        setShowGroupModal(false);
        setSelectedMembers(new Set());
        setSelectedGroup('');
        mutateMembers();
      } else {
        const data = await response.json();
        alert(data.error || '그룹 지정에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to assign group:', error);
    } finally {
      setSaving(false);
    }
  };

  // SMS 모달 열기
  const handleOpenSmsModal = (targetMembers?: Member[]) => {
    const targets = targetMembers || members.filter(m => selectedMembers.has(m.id));
    if (targets.length === 0) {
      alert('회원을 선택해주세요.');
      return;
    }
    setSmsTargets(targets);
    setSmsMessage('');
    setShowSmsModal(true);
  };

  // SMS 발송
  const handleSendSms = async () => {
    if (!smsMessage.trim()) {
      alert('메시지를 입력해주세요.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/admin/members/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phones: smsTargets.map(m => m.phone).filter(Boolean),
          message: smsMessage,
        }),
      });
      if (response.ok) {
        alert('SMS가 발송되었습니다.');
        setShowSmsModal(false);
        setSelectedMembers(new Set());
      } else {
        const data = await response.json();
        alert(data.error || 'SMS 발송에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to send SMS:', error);
    } finally {
      setSaving(false);
    }
  };

  // 삭제 모달 열기
  const handleOpenDeleteModal = (targetIds?: string[]) => {
    const targets = targetIds || Array.from(selectedMembers);
    if (targets.length === 0) {
      alert('회원을 선택해주세요.');
      return;
    }
    setDeleteTargets(targets);
    setShowDeleteModal(true);
  };

  // 회원 삭제
  const handleDeleteMembers = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/members/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberIds: deleteTargets }),
      });
      if (response.ok) {
        setShowDeleteModal(false);
        setSelectedMembers(new Set());
        setDeleteTargets([]);
        mutateMembers();
      } else {
        const data = await response.json();
        // 상세 에러 메시지 표시
        if (data.details && Array.isArray(data.details)) {
          const detailMessages = data.details.map((d: { email: string; reason: string }) =>
            `• ${d.email}: ${d.reason}`
          ).join('\n');
          alert(`${data.error || '삭제에 실패했습니다.'}\n\n${detailMessages}`);
        } else {
          alert(data.error || '삭제에 실패했습니다.');
        }
      }
    } catch (error) {
      console.error('Failed to delete members:', error);
    } finally {
      setSaving(false);
    }
  };

  // 엑셀 내보내기
  const handleExportExcel = () => {
    const targetMembers = selectedMembers.size > 0
      ? members.filter(m => selectedMembers.has(m.id))
      : members;

    if (targetMembers.length === 0) {
      alert('내보낼 회원이 없습니다.');
      return;
    }

    // CSV 형식으로 생성
    const headers = ['이메일', '이름', '연락처', '매장', '이용금액', '가입일', '그룹'];
    const rows = targetMembers.map(m => [
      m.email || '',
      m.name || '',
      m.phone || '',
      m.tenants?.[0]?.brandName || '',
      m.totalPaymentAmount ? m.totalPaymentAmount.toLocaleString() : '0',
      m.createdAt ? new Date(m.createdAt).toLocaleDateString('ko-KR') : '',
      m.group || '',
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `회원목록_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // 정렬된 회원 목록
  const sortedMembers = useMemo(() => {
    let filtered = members.filter(member => {
      if (filterGroup.length === 0) return true;
      return filterGroup.includes(member.group || 'normal');
    });

    if (sortField === 'createdAt') {
      filtered = [...filtered].sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
      });
    }

    return filtered;
  }, [members, filterGroup, sortField, sortOrder]);

  // 가입일 정렬 토글
  const handleSortCreatedAt = () => {
    if (sortField === 'createdAt') {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField('createdAt');
      setSortOrder('desc');
    }
  };

  // 액션 메뉴 및 필터 드롭다운 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setActionMenuOpen(null);
        setActionMenuPosition(null);
      }
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilterDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Group className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">회원</h1>
          <span className="text-sm text-gray-500">총 {pagination.total}명</span>
        </div>
        <div className="flex items-center gap-2">
          {/* 필터 버튼 */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className={`relative p-2 border rounded-lg transition-colors ${
                filterGroup.length > 0
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Filter className="w-5 h-5" />
              {filterGroup.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-600 text-white text-[10px] rounded-full flex items-center justify-center">
                  {filterGroup.length}
                </span>
              )}
            </button>
            {showFilterDropdown && (
              <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-gray-900">필터</h3>
                  {filterGroup.length > 0 && (
                    <button
                      onClick={() => setFilterGroup([])}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      초기화
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-gray-500 mb-2">그룹</p>
                  {MEMBER_GROUP_OPTIONS.map(option => (
                    <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filterGroup.includes(option.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFilterGroup([...filterGroup, option.value]);
                          } else {
                            setFilterGroup(filterGroup.filter(g => g !== option.value));
                          }
                        }}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300"
                      />
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        option.value === 'internal'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {option.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          {activeTab === 'active' && (
            <button
              onClick={handleOpenModal}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              회원 추가
            </button>
          )}
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => handleTabChange('active')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'active'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          활성
        </button>
        <button
          onClick={() => handleTabChange('deleted')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'deleted'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          삭제
        </button>
      </div>

      {/* 검색 및 필터 */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="이름, 이메일, 전화번호, 매장명 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            type="submit"
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            검색
          </button>
        </form>
      </div>

      {/* 일괄 작업 버튼 */}
      {selectedMembers.size > 0 && activeTab === 'active' && (
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 flex items-center gap-4">
          <span className="text-sm font-medium text-blue-700">
            {selectedMembers.size}명 선택됨
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleOpenGroupModal}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
            >
              <Group className="w-4 h-4" />
              그룹지정
            </button>
            <button
              onClick={() => handleOpenSmsModal()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
            >
              <MessageText className="w-4 h-4" />
              SMS
            </button>
            <button
              onClick={() => handleOpenDeleteModal()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 text-sm"
            >
              <Trash className="w-4 h-4" />
              삭제
            </button>
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
            >
              <Download className="w-4 h-4" />
              내보내기
            </button>
          </div>
        </div>
      )}

      {/* 회원 목록 테이블 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size="md" />
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            회원이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="w-12 px-4 py-4">
                    <input
                      type="checkbox"
                      checked={members.length > 0 && selectedMembers.size === members.length}
                      onChange={handleSelectAll}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                  </th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">이메일</th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">이름</th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">연락처</th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">그룹</th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">매장</th>
                  <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">이용금액</th>
                  <th
                    className="text-center px-6 py-4 text-sm font-medium text-gray-500 cursor-pointer hover:bg-gray-100 transition-colors select-none"
                    onClick={handleSortCreatedAt}
                  >
                    <div className="flex items-center justify-center gap-1">
                      가입일
                      {sortField === 'createdAt' ? (
                        sortOrder === 'desc' ? (
                          <NavArrowDown className="w-4 h-4 text-blue-600" strokeWidth={2} />
                        ) : (
                          <NavArrowUp className="w-4 h-4 text-blue-600" strokeWidth={2} />
                        )
                      ) : (
                        <NavArrowDown className="w-4 h-4 text-gray-300" strokeWidth={2} />
                      )}
                    </div>
                  </th>
                  {activeTab === 'deleted' && (
                    <>
                      <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">결제이력</th>
                      <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">삭제일</th>
                      <th className="text-center px-6 py-4 text-sm font-medium text-gray-500">보관기한</th>
                    </>
                  )}
                  <th className="w-12 px-4 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedMembers.map((member) => (
                  <tr
                    key={member.id}
                    onClick={() => router.push(`/admin/members/${member.id}`)}
                    className={`hover:bg-gray-50 cursor-pointer transition-colors ${selectedMembers.has(member.id) ? 'bg-blue-50' : ''}`}
                  >
                    <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedMembers.has(member.id)}
                        onChange={(e) => handleSelectMember(member.id, e as unknown as React.MouseEvent)}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-center">
                      {member.email || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 text-center">
                      {member.name || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-center">
                      {member.phone || '-'}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        member.group === 'internal'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {MEMBER_GROUPS[member.group as keyof typeof MEMBER_GROUPS] || '일반'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-center">
                      {member.tenantCount > 0 ? (
                        <div>
                          <span className="font-medium">{member.tenants[0]?.brandName || '-'}</span>
                          {member.tenantCount > 1 && (
                            <span className="ml-1 text-xs text-gray-400">
                              외 {member.tenantCount - 1}개
                            </span>
                          )}
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 text-center">
                      {member.totalPaymentAmount ? `${member.totalPaymentAmount.toLocaleString()}원` : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 text-center">
                      {member.createdAt ? new Date(member.createdAt).toLocaleDateString('ko-KR') : '-'}
                    </td>
                    {activeTab === 'deleted' && (
                      <>
                        <td className="px-6 py-4 text-sm text-center">
                          {member.retentionReason === '전자상거래법_5년' ? (
                            <span className="text-blue-600 font-medium">O</span>
                          ) : (
                            <span className="text-gray-400">X</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 text-center">
                          {member.deletedAt ? new Date(member.deletedAt).toLocaleDateString('ko-KR') : '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 text-center">
                          {member.retentionEndDate ? (
                            <span title={member.retentionReason === '전자상거래법_5년' ? '전자상거래법 (5년)' : '부정이용방지 (1년)'}>
                              {new Date(member.retentionEndDate).toLocaleDateString('ko-KR')}
                            </span>
                          ) : '-'}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-4 relative" onClick={(e) => e.stopPropagation()}>
                      <div ref={actionMenuOpen === member.id ? actionMenuRef : undefined}>
                        <button
                          onClick={(e) => {
                            if (actionMenuOpen === member.id) {
                              setActionMenuOpen(null);
                              setActionMenuPosition(null);
                            } else {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setActionMenuPosition({
                                top: rect.bottom + 4,
                                left: rect.right - 120,
                              });
                              setActionMenuOpen(member.id);
                            }
                          }}
                          className="p-1 hover:bg-gray-100 rounded"
                        >
                          <MoreHoriz className="w-5 h-5 text-gray-500" />
                        </button>
                        {actionMenuOpen === member.id && actionMenuPosition && (
                          <div
                            className="fixed bg-white border border-gray-200 rounded-lg shadow-lg z-[9999] py-1 min-w-[120px]"
                            style={{ top: actionMenuPosition.top, left: actionMenuPosition.left }}
                          >
                            <button
                              onClick={() => {
                                handleOpenSmsModal([member]);
                                setActionMenuOpen(null);
                                setActionMenuPosition(null);
                              }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <MessageText className="w-4 h-4" />
                              SMS
                            </button>
                            <button
                              onClick={() => {
                                handleOpenDeleteModal([member.id]);
                                setActionMenuOpen(null);
                                setActionMenuPosition(null);
                              }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                            >
                              <Trash className="w-4 h-4" />
                              삭제
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 페이지네이션 */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              {pagination.total}개 중 {(pagination.page - 1) * pagination.limit + 1}-
              {Math.min(pagination.page * pagination.limit, pagination.total)}개 표시
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page === 1}
                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <NavArrowLeft className="w-5 h-5" />
              </button>
              <span className="text-sm text-gray-600">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page === pagination.totalPages}
                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <NavArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 회원 추가 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">회원 등록</h2>
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
                  이메일 (ID) <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="email@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  비밀번호 (PW) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-4 py-2 pr-10 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="비밀번호 입력 (6자 이상)"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeClosed className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  비밀번호 확인 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPasswordConfirm ? 'text' : 'password'}
                    value={formData.passwordConfirm}
                    onChange={(e) => setFormData({ ...formData, passwordConfirm: e.target.value })}
                    className="w-full px-4 py-2 pr-10 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="비밀번호 재입력"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPasswordConfirm ? <EyeClosed className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {formData.passwordConfirm && formData.password !== formData.passwordConfirm && (
                  <p className="text-xs text-red-500 mt-1">비밀번호가 일치하지 않습니다.</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  이름
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="이름 입력"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  연락처
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="010-0000-0000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  그룹
                </label>
                <select
                  value={formData.group}
                  onChange={(e) => setFormData({ ...formData, group: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {MEMBER_GROUP_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
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
                {saving ? <RefreshDouble className="w-5 h-5 animate-spin mx-auto" /> : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 그룹 지정 모달 */}
      {showGroupModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">그룹 지정</h2>
              <button
                onClick={() => setShowGroupModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <Xmark className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              {selectedMembers.size}명의 회원에게 그룹을 지정합니다.
            </p>

            {/* 그룹 선택 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">그룹 선택</label>
              <div className="space-y-2">
                {MEMBER_GROUP_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${selectedGroup === option.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}
                  >
                    <input
                      type="radio"
                      name="group"
                      value={option.value}
                      checked={selectedGroup === option.value}
                      onChange={(e) => setSelectedGroup(e.target.value)}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      option.value === 'internal'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {option.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowGroupModal(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleAssignGroup}
                disabled={saving || !selectedGroup}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving ? <RefreshDouble className="w-5 h-5 animate-spin mx-auto" /> : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SMS 발송 모달 */}
      {showSmsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">SMS 발송</h2>
              <button
                onClick={() => setShowSmsModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <Xmark className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">
                수신자: {smsTargets.length}명
              </p>
              <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded max-h-20 overflow-y-auto">
                {smsTargets.map(t => t.phone || t.email).filter(Boolean).join(', ')}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">메시지 내용</label>
              <textarea
                value={smsMessage}
                onChange={(e) => setSmsMessage(e.target.value)}
                placeholder="메시지를 입력하세요..."
                rows={5}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <p className="text-xs text-gray-500 mt-1">{smsMessage.length}/90자 (90자 초과시 LMS)</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowSmsModal(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSendSms}
                disabled={saving || !smsMessage.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving ? <RefreshDouble className="w-5 h-5 animate-spin mx-auto" /> : '발송'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-red-600">회원 삭제</h2>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <Xmark className="w-5 h-5" />
              </button>
            </div>

            <p className="text-gray-600 mb-6">
              선택한 <span className="font-bold text-red-600">{deleteTargets.length}명</span>의 회원을 삭제하시겠습니까?
              <br />
              <span className="text-sm text-gray-500">이 작업은 되돌릴 수 없습니다.</span>
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleDeleteMembers}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {saving ? <RefreshDouble className="w-5 h-5 animate-spin mx-auto" /> : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
