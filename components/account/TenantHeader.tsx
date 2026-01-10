'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sofa, EditPencil, Trash } from 'iconoir-react';
import EditTenantModal from './EditTenantModal';
import DeleteTenantModal from './DeleteTenantModal';
import { INDUSTRIES, type IndustryCode } from '@/lib/constants';

interface Subscription {
  plan: string;
  status: string;
}

interface TenantHeaderProps {
  tenantId: string;
  brandName: string;
  industry?: string | null;
  authParam: string;
  subscription?: Subscription | null;
}

export default function TenantHeader({
  tenantId,
  brandName,
  industry,
  authParam,
  subscription,
}: TenantHeaderProps) {
  const router = useRouter();
  const [currentBrandName, setCurrentBrandName] = useState(brandName);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleEditSuccess = (updatedBrandName: string) => {
    setCurrentBrandName(updatedBrandName);
    router.refresh();
  };

  return (
    <>
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center">
            <Sofa width={20} height={20} strokeWidth={1.5} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">{currentBrandName}</h1>

          {/* 수정 버튼 */}
          <button
            onClick={() => setShowEditModal(true)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="매장 정보 수정"
          >
            <EditPencil width={18} height={18} strokeWidth={1.5} className="text-gray-500" />
          </button>

          {/* 삭제 버튼 */}
          <button
            onClick={() => setShowDeleteModal(true)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="매장 삭제"
          >
            <Trash width={18} height={18} strokeWidth={1.5} className="text-gray-500" />
          </button>
        </div>
        {industry && (
          <p className="text-gray-500">{INDUSTRIES[industry as IndustryCode] || industry}</p>
        )}
      </div>

      {/* 수정 모달 */}
      {showEditModal && (
        <EditTenantModal
          tenant={{ tenantId, brandName: currentBrandName, industry }}
          onClose={() => setShowEditModal(false)}
          onSuccess={handleEditSuccess}
          authParam={authParam}
        />
      )}

      {/* 삭제 모달 */}
      {showDeleteModal && (
        <DeleteTenantModal
          tenant={{ tenantId, brandName: currentBrandName, subscription: subscription || null }}
          onClose={() => setShowDeleteModal(false)}
          onSuccess={() => {
            router.push(`/account?${authParam}`);
            router.refresh();
          }}
          authParam={authParam}
        />
      )}
    </>
  );
}
