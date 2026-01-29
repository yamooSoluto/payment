'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FloppyDisk, RefreshDouble } from 'iconoir-react';
import Spinner from '@/components/admin/Spinner';
import { Member, TenantInfo } from '@/components/admin/member-detail/types';
import MemberInfoCard from '@/components/admin/member-detail/MemberInfoCard';
import TenantListSection from '@/components/admin/member-detail/TenantListSection';
import PaymentHistorySection from '@/components/admin/member-detail/PaymentHistorySection';
import SubscriptionHistorySection from '@/components/admin/member-detail/SubscriptionHistorySection';
import PasswordChangeModal from '@/components/admin/member-detail/PasswordChangeModal';
import AddTenantModal from '@/components/admin/member-detail/AddTenantModal';
import TenantDetailModal from '@/components/admin/member-detail/TenantDetailModal';

export default function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  // 핵심 데이터
  const [member, setMember] = useState<Member | null>(null);
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // 수정 모드
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    memo: '',
    newEmail: '',
    group: 'normal',
  });
  const [saving, setSaving] = useState(false);

  // 매장 삭제 진행 상태
  const [deletingTenantId, setDeletingTenantId] = useState<string | null>(null);

  // 모달 상태
  const [passwordModal, setPasswordModal] = useState(false);
  const [addTenantModal, setAddTenantModal] = useState(false);
  const [tenantDetailModal, setTenantDetailModal] = useState<TenantInfo | null>(null);

  // 하위 섹션 리프레시 트리거
  const [refreshKey, setRefreshKey] = useState(0);

  // 회원 + 매장 기본 정보 로딩
  const fetchMemberDetail = async () => {
    try {
      const response = await fetch(`/api/admin/members/${id}`);
      if (response.ok) {
        const data = await response.json();
        setMember(data.member);
        setTenants(data.tenants || []);
        setFormData({
          name: data.member.name || '',
          phone: data.member.phone || '',
          memo: data.member.memo || '',
          newEmail: data.member.email || '',
          group: data.member.group || 'normal',
        });
      }
    } catch (error) {
      console.error('Failed to fetch member:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMemberDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 회원 정보 저장
  const handleSave = async () => {
    if (formData.newEmail && member && formData.newEmail.toLowerCase() !== member.email.toLowerCase()) {
      const confirmed = confirm(
        `이메일을 변경하시겠습니까?\n\n` +
        `기존: ${member.email}\n` +
        `변경: ${formData.newEmail}\n\n` +
        `⚠️ 변경 후 사용자는 새 이메일로 재로그인해야 합니다.`
      );
      if (!confirmed) return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/admin/members/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        setEditMode(false);
        if (data.newEmail) {
          alert(data.message || '이메일이 변경되었습니다.');
          router.replace(`/admin/members/${encodeURIComponent(data.newEmail)}`);
        } else {
          fetchMemberDetail();
        }
      } else {
        alert(data.error || '저장에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to save member:', error);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // 매장 삭제
  const handleDeleteTenant = async (tenant: TenantInfo) => {
    if (!confirm(`'${tenant.brandName}' 매장을 삭제하시겠습니까?`)) return;

    setDeletingTenantId(tenant.tenantId);
    try {
      const response = await fetch(`/api/admin/tenants/${tenant.tenantId}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (response.ok) {
        setTenants(prev => prev.filter(t => t.tenantId !== tenant.tenantId));
        alert('매장이 삭제되었습니다.');
      } else {
        alert(data.error || '매장 삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to delete tenant:', error);
      alert('오류가 발생했습니다.');
    } finally {
      setDeletingTenantId(null);
    }
  };

  // 전체 새로고침 (구독 액션 후 호출용)
  const refreshAll = () => {
    fetchMemberDetail();
    setRefreshKey(prev => prev + 1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="md" />
      </div>
    );
  }

  if (!member) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">회원을 찾을 수 없습니다.</p>
        <button
          onClick={() => router.back()}
          className="mt-4 text-blue-600 hover:underline"
        >
          돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{member.name || '이름 없음'}</h1>
            <p className="text-sm text-gray-500">{member.userId || member.email}</p>
          </div>
          <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
            매장 {tenants.length}개
          </span>
          {member.deleted && (
            <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-600 rounded-full">
              삭제됨
            </span>
          )}
        </div>
        {!member.deleted && (
          <div className="flex gap-2">
            {editMode ? (
              <>
                <button
                  onClick={() => setEditMode(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {saving ? <RefreshDouble className="w-4 h-4 animate-spin" /> : <FloppyDisk className="w-4 h-4" />}
                  저장
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditMode(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                수정
              </button>
            )}
          </div>
        )}
      </div>

      {/* 기본 정보 */}
      <MemberInfoCard
        member={member}
        editMode={editMode}
        formData={formData}
        onFormChange={setFormData}
        onPasswordClick={() => setPasswordModal(true)}
      />

      {/* 매장 목록 */}
      <TenantListSection
        tenants={tenants}
        memberDeleted={member.deleted}
        onAddTenant={() => setAddTenantModal(true)}
        onEditTenant={(tenant) => setTenantDetailModal(tenant)}
        onDeleteTenant={handleDeleteTenant}
        deletingTenantId={deletingTenantId}
      />

      {/* 결제 내역 */}
      <PaymentHistorySection key={`payments-${refreshKey}`} memberId={id} member={member} tenants={tenants} />

      {/* 구독 내역 */}
      <SubscriptionHistorySection key={`subs-${refreshKey}`} memberId={id} member={member} tenants={tenants} />

      {/* 비밀번호 변경 모달 */}
      {passwordModal && (
        <PasswordChangeModal
          memberId={id}
          email={member.email}
          onClose={() => setPasswordModal(false)}
        />
      )}

      {/* 매장 추가 모달 */}
      {addTenantModal && (
        <AddTenantModal
          email={member.email}
          onClose={() => setAddTenantModal(false)}
          onSuccess={(newTenant) => {
            setTenants(prev => [...prev, newTenant]);
            setAddTenantModal(false);
          }}
        />
      )}

      {/* 매장 상세 수정 모달 */}
      {tenantDetailModal && (
        <TenantDetailModal
          tenant={tenantDetailModal}
          member={member}
          onClose={() => setTenantDetailModal(null)}
          onSuccess={(updatedTenant) => {
            setTenants(prev => prev.map(t =>
              t.tenantId === tenantDetailModal.tenantId
                ? { ...t, ...updatedTenant }
                : t
            ));
            setTenantDetailModal(null);
          }}
          onRefresh={refreshAll}
        />
      )}
    </div>
  );
}
