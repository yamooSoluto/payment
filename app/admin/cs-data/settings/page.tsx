'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash, Check, ArrowUp, Xmark } from 'iconoir-react';
import Spinner from '@/components/admin/Spinner';

interface CustomRequest {
  type: 'platform' | 'service';
  name: string;
  tenantId: string;
  requestedAt: string;
}

// ═══════════════════════════════════════════════════════════
// CS 데이터 설정
// ═══════════════════════════════════════════════════════════

export default function CsDataSettingsPage() {
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [customRequests, setCustomRequests] = useState<CustomRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newPlatform, setNewPlatform] = useState('');
  const [newService, setNewService] = useState('');
  const [dirty, setDirty] = useState(false);

  // ── 데이터 로드 ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/settings/cs-data');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setPlatforms(data.platforms || []);
      setServices(data.services || []);
      setCustomRequests(data.customRequests || []);
      setDirty(false);
    } catch (err) {
      console.error('[cs-data settings] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── 플랫폼 ──
  const handleAddPlatform = () => {
    const name = newPlatform.trim();
    if (!name || platforms.includes(name)) return;
    setPlatforms(prev => [...prev, name]);
    setNewPlatform('');
    setDirty(true);
  };

  const handleRemovePlatform = (name: string) => {
    setPlatforms(prev => prev.filter(p => p !== name));
    setDirty(true);
  };

  // ── 서비스 ──
  const handleAddService = () => {
    const name = newService.trim();
    if (!name || services.includes(name)) return;
    setServices(prev => [...prev, name]);
    setNewService('');
    setDirty(true);
  };

  const handleRemoveService = (name: string) => {
    setServices(prev => prev.filter(s => s !== name));
    setDirty(true);
  };

  // ── 커스텀 요청 승격 ──
  const handlePromote = (req: CustomRequest) => {
    if (req.type === 'platform') {
      if (!platforms.includes(req.name)) {
        setPlatforms(prev => [...prev, req.name]);
      }
    } else {
      if (!services.includes(req.name)) {
        setServices(prev => [...prev, req.name]);
      }
    }
    setCustomRequests(prev => prev.filter(r => !(r.name === req.name && r.type === req.type)));
    setDirty(true);
  };

  // ── 커스텀 요청 무시 ──
  const handleDismiss = (req: CustomRequest) => {
    setCustomRequests(prev => prev.filter(r => !(r.name === req.name && r.type === req.type)));
    setDirty(true);
  };

  // ── 저장 ──
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings/cs-data', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platforms, services, customRequests }),
      });
      if (!res.ok) throw new Error('저장 실패');
      setDirty(false);
    } catch (err: any) {
      alert(err.message || '저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  }, [platforms, services, customRequests]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">CS 데이터 설정</h1>
          <p className="text-sm text-gray-500 mt-0.5">규정/FAQ의 적용 대상에 사용되는 플랫폼·서비스 목록을 관리합니다.</p>
        </div>
        {dirty && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors disabled:bg-gray-300"
          >
            <Check className="w-4 h-4" />
            {saving ? '저장 중...' : '저장'}
          </button>
        )}
      </div>

      <div className="space-y-6">
        {/* 플랫폼 목록 */}
        <ListSection
          title="플랫폼 목록"
          description="이용 중인 플랫폼입니다. 회원 포탈에서 선택 옵션으로 노출됩니다."
          items={platforms}
          newValue={newPlatform}
          onNewValueChange={setNewPlatform}
          onAdd={handleAddPlatform}
          onRemove={handleRemovePlatform}
          placeholder="새 플랫폼 이름"
          emptyText="등록된 플랫폼이 없습니다."
        />

        {/* 서비스 목록 */}
        <ListSection
          title="서비스 목록"
          description="이용 가능한 서비스입니다. 회원 포탈에서 선택 옵션으로 노출됩니다."
          items={services}
          newValue={newService}
          onNewValueChange={setNewService}
          onAdd={handleAddService}
          onRemove={handleRemoveService}
          placeholder="새 서비스 이름"
          emptyText="등록된 서비스가 없습니다."
        />

        {/* 테넌트 직접 추가 요청 */}
        {customRequests.length > 0 && (
          <div className="bg-white rounded-xl border border-amber-200 p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">테넌트 요청 항목</h2>
            <p className="text-xs text-gray-400 mb-4">회원이 직접 입력한 항목입니다. 공식 옵션으로 승격하거나 무시할 수 있습니다.</p>

            <div className="space-y-2">
              {customRequests.map((req, i) => (
                <div
                  key={`${req.type}-${req.name}-${i}`}
                  className="flex items-center justify-between px-4 py-2.5 bg-amber-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      req.type === 'platform' ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'
                    }`}>
                      {req.type === 'platform' ? '플랫폼' : '서비스'}
                    </span>
                    <span className="text-sm text-gray-700 font-medium">{req.name}</span>
                    <span className="text-xs text-gray-400">{req.tenantId}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handlePromote(req)}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="공식 옵션으로 승격"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                      승격
                    </button>
                    <button
                      onClick={() => handleDismiss(req)}
                      className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                      title="무시"
                    >
                      <Xmark className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 재사용 리스트 섹션 ──
function ListSection({
  title,
  description,
  items,
  newValue,
  onNewValueChange,
  onAdd,
  onRemove,
  placeholder,
  emptyText,
}: {
  title: string;
  description: string;
  items: string[];
  newValue: string;
  onNewValueChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (name: string) => void;
  placeholder: string;
  emptyText: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-900 mb-1">{title}</h2>
      <p className="text-xs text-gray-400 mb-4">{description}</p>

      <div className="space-y-2 mb-4">
        {items.length === 0 && (
          <p className="text-sm text-gray-400 py-3 text-center">{emptyText}</p>
        )}
        {items.map(item => (
          <div
            key={item}
            className="flex items-center justify-between px-4 py-2.5 bg-gray-50 rounded-lg group"
          >
            <span className="text-sm text-gray-700">{item}</span>
            <button
              onClick={() => onRemove(item)}
              className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
            >
              <Trash className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newValue}
          onChange={e => onNewValueChange(e.target.value)}
          onKeyDown={e => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Enter') onAdd();
          }}
          placeholder={placeholder}
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <button
          onClick={onAdd}
          disabled={!newValue.trim()}
          className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-40"
        >
          <Plus className="w-4 h-4" />
          추가
        </button>
      </div>
    </div>
  );
}