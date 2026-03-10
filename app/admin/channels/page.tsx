'use client';

import { useState, useCallback } from 'react';
import useSWR from 'swr';
import {
  Plus, Trash, EditPencil, NavArrowDown, NavArrowUp, Xmark,
  Search, Check, WarningCircle, Copy,
} from 'iconoir-react';
import Spinner from '@/components/admin/Spinner';
import IntegrationSetupTab from './IntegrationSetupTab';

// ─── Types ───
interface TenantMapping {
  tenantId: string;
  brandName: string;
  subChannelKey: string;
}

interface Channel {
  id: string;
  channelId: string;
  name: string;
  accessKey: string;
  secretKey: string;
  webhookToken: string | null;
  botName: string | null;
  tenants: TenantMapping[];
  createdAt: string | null;
  updatedAt: string | null;
}

interface TenantOption {
  tenantId: string;
  brandName: string;
  branchNo: string;
}

interface NaverIntegration {
  id: string;
  integrationId: string;
  tenantId: string | null;
  branchNo: string | null;
  brandCode: string | null;
  channel: string;
  status: string;
  inboundSecret: string | null;
  provider: { kind: string; apiKeySecretRef: string | null } | null;
  cw: {
    accountId: number;
    inboxId: number;
    type: string | null;
    websiteTokenSecretRef: string | null;
    hmacSecretRef: string | null;
    inboxIdentifierSecretRef: string | null;
    botTokenSecretRef: string | null;
    accessTokenSecretRef: string | null;
  } | null;
  tenant: { brandName: string; branchNo: string; naverInboundUrl: string | null } | null;
  createdAt: string | null;
  updatedAt: string | null;
}

// ─── Detected Channel Type ───
interface DetectedChannel {
  key: string;
  name: string;
  type: string;
  id: string;
}

const CHANNEL_TYPE_LABEL: Record<string, string> = {
  kakao: '카카오톡',
  naver: '네이버톡톡',
  instagram: '인스타그램',
  unknown: '기타',
};

const CHANNEL_TYPE_COLOR: Record<string, string> = {
  kakao: 'bg-yellow-100 text-yellow-800',
  naver: 'bg-green-100 text-green-800',
  instagram: 'bg-pink-100 text-pink-800',
  unknown: 'bg-gray-100 text-gray-600',
};

const fetcher = (url: string) => fetch(url).then(r => r.json());

type TabType = 'integrations' | 'naver' | 'channeltalk';

export default function ChannelsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('integrations');

  const tabs: { key: TabType; label: string }[] = [
    { key: 'integrations', label: '연동 현황' },
    { key: 'naver', label: '네이버톡톡' },
    { key: 'channeltalk', label: '채널톡' },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">채널 관리</h1>
        <p className="text-sm text-gray-500 mt-1">매장별 연동 현황을 관리하고 채널을 설정하세요</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'integrations' && <IntegrationSetupTab />}
      {activeTab === 'naver' && <NaverTab />}
      {activeTab === 'channeltalk' && <ChannelTalkTab />}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 채널톡 탭
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ChannelTalkTab() {
  const { data, error, isLoading, mutate } = useSWR<{ channels: Channel[] }>('/api/admin/channels', fetcher);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [saving, setSaving] = useState(false);

  const channels = data?.channels || [];

  const handleDelete = useCallback(async (channelId: string) => {
    if (!confirm(`채널 ${channelId}를 삭제하시겠습니까?`)) return;
    await fetch(`/api/admin/channels?channelId=${channelId}`, { method: 'DELETE' });
    mutate();
  }, [mutate]);

  if (isLoading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (error) return <div className="p-8 text-red-500">채널 목록을 불러오지 못했습니다.</div>;

  return (
    <>
      <div className="flex items-center justify-end mb-4">
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          채널 추가
        </button>
      </div>

      {channels.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium">등록된 채널이 없습니다</p>
          <p className="text-sm mt-1">채널 추가 버튼으로 메인 채널을 등록하세요</p>
        </div>
      ) : (
        <div className="space-y-4">
          {channels.map(ch => (
            <ChannelCard
              key={ch.id}
              channel={ch}
              expanded={expandedId === ch.id}
              onToggle={() => setExpandedId(expandedId === ch.id ? null : ch.id)}
              onEdit={() => setEditingChannel(ch)}
              onDelete={() => handleDelete(ch.channelId)}
              onTenantsChanged={() => mutate()}
              saving={saving}
              setSaving={setSaving}
            />
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateChannelModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); mutate(); }}
        />
      )}

      {editingChannel && (
        <EditChannelModal
          channel={editingChannel}
          onClose={() => setEditingChannel(null)}
          onSaved={() => { setEditingChannel(null); mutate(); }}
        />
      )}
    </>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 네이버톡톡 탭
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function NaverTab() {
  const { data, error, isLoading, mutate } = useSWR<{ integrations: NaverIntegration[] }>('/api/admin/naver-integrations', fetcher);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingIntegration, setEditingIntegration] = useState<NaverIntegration | null>(null);

  const integrations = data?.integrations || [];

  const handleDelete = useCallback(async (integrationId: string) => {
    if (!confirm('이 네이버 연동을 삭제하시겠습니까?')) return;
    await fetch(`/api/admin/naver-integrations?integrationId=${integrationId}`, { method: 'DELETE' });
    mutate();
  }, [mutate]);

  if (isLoading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (error) return <div className="p-8 text-red-500">네이버 연동 목록을 불러오지 못했습니다.</div>;

  return (
    <>
      <div className="flex items-center justify-end mb-4">
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          네이버 연동 추가
        </button>
      </div>

      {integrations.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium">등록된 네이버 연동이 없습니다</p>
          <p className="text-sm mt-1">네이버 연동 추가 버튼으로 테넌트에 네이버톡톡을 연결하세요</p>
        </div>
      ) : (
        <div className="space-y-3">
          {integrations.map(ig => (
            <NaverIntegrationCard
              key={ig.id}
              integration={ig}
              onEdit={() => setEditingIntegration(ig)}
              onDelete={() => handleDelete(ig.integrationId)}
            />
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateNaverModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); mutate(); }}
        />
      )}

      {editingIntegration && (
        <EditNaverModal
          integration={editingIntegration}
          onClose={() => setEditingIntegration(null)}
          onSaved={() => { setEditingIntegration(null); mutate(); }}
        />
      )}
    </>
  );
}

// ─── Naver Integration Card ───
function NaverIntegrationCard({
  integration, onEdit, onDelete,
}: {
  integration: NaverIntegration;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isActive = integration.status === 'active';

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const inboundUrl = integration.tenant?.naverInboundUrl
    || (integration.brandCode ? `https://cs-api-******.cloudfunctions.net/${integration.brandCode}/naver/inbound` : null);

  return (
    <div className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/naver_talktalk.png" alt="네이버" className="w-6 h-6" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900">
                {integration.tenant?.brandName || integration.tenantId || '(테넌트 없음)'}
              </span>
              {integration.branchNo && (
                <span className="text-xs text-gray-400 font-mono">#{integration.branchNo}</span>
              )}
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {isActive ? 'Active' : integration.status}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              {integration.brandCode && (
                <span className="text-xs text-gray-500">brandCode: {integration.brandCode}</span>
              )}
              <span className="text-xs text-gray-400 font-mono">{integration.integrationId}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <EditPencil className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash className="w-4 h-4" />
          </button>
          {expanded ? <NavArrowUp className="w-5 h-5 text-gray-400" /> : <NavArrowDown className="w-5 h-5 text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4 space-y-3">
          {/* Inbound URL */}
          {inboundUrl && (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
              <span className="text-xs text-gray-500 flex-shrink-0">Inbound URL</span>
              <span className="text-xs font-mono text-gray-700 truncate flex-1">{inboundUrl}</span>
              <button
                onClick={() => copyToClipboard(inboundUrl)}
                className="p-1 rounded text-gray-400 hover:text-blue-600 flex-shrink-0"
                title="복사"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="px-3 py-2 bg-gray-50 rounded-lg">
              <span className="text-gray-400 block mb-0.5">Inbound Secret</span>
              <span className="text-gray-700 font-mono">{integration.inboundSecret || '(없음)'}</span>
            </div>
            <div className="px-3 py-2 bg-gray-50 rounded-lg">
              <span className="text-gray-400 block mb-0.5">API Key Ref</span>
              <span className="text-gray-700 font-mono">{integration.provider?.apiKeySecretRef || '(없음)'}</span>
            </div>
          </div>

          {/* Chatwoot Info */}
          {integration.cw && (integration.cw.accountId || integration.cw.inboxId) && (
            <div>
              <span className="text-xs font-semibold text-gray-600 mb-1.5 block">Chatwoot 연결</span>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="px-3 py-2 bg-blue-50 rounded-lg">
                  <span className="text-blue-400 block mb-0.5">Account ID</span>
                  <span className="text-blue-700 font-mono">{integration.cw.accountId || '-'}</span>
                </div>
                <div className="px-3 py-2 bg-blue-50 rounded-lg">
                  <span className="text-blue-400 block mb-0.5">Inbox ID</span>
                  <span className="text-blue-700 font-mono">{integration.cw.inboxId || '-'}</span>
                </div>
                <div className="px-3 py-2 bg-blue-50 rounded-lg">
                  <span className="text-blue-400 block mb-0.5">Type</span>
                  <span className="text-blue-700">{integration.cw.type || 'api'}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Create Naver Modal ───
function CreateNaverModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState<'tenant' | 'config'>('tenant');
  const [selectedTenant, setSelectedTenant] = useState<TenantOption | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<TenantOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [form, setForm] = useState({
    inboundSecret: '',
    apiKeySecretRef: '',
    cwAccountId: '',
    cwInboxId: '',
    cwInboxIdentifierSecretRef: '',
    cwAccessTokenSecretRef: '',
    cwBotTokenSecretRef: '',
    cwWebsiteTokenSecretRef: '',
    cwHmacSecretRef: '',
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/tenants?search=${encodeURIComponent(q)}&limit=10`);
      const data = await res.json();
      setResults((data.tenants || []).map((t: { tenantId: string; brandName: string; branchNo: string }) => ({
        tenantId: t.tenantId,
        brandName: t.brandName || '(이름 없음)',
        branchNo: t.branchNo || '',
      })));
    } catch { setResults([]); }
    finally { setSearching(false); }
  }, []);

  const handleCreate = async () => {
    if (!selectedTenant) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/admin/naver-integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: selectedTenant.tenantId,
          inboundSecret: form.inboundSecret || null,
          provider: form.apiKeySecretRef ? { apiKeySecretRef: form.apiKeySecretRef } : null,
          cw: (form.cwAccountId || form.cwInboxId) ? {
            accountId: parseInt(form.cwAccountId) || 0,
            inboxId: parseInt(form.cwInboxId) || 0,
            type: 'api',
            inboxIdentifierSecretRef: form.cwInboxIdentifierSecretRef || null,
            accessTokenSecretRef: form.cwAccessTokenSecretRef || null,
            botTokenSecretRef: form.cwBotTokenSecretRef || null,
            websiteTokenSecretRef: form.cwWebsiteTokenSecretRef || null,
            hmacSecretRef: form.cwHmacSecretRef || null,
          } : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : '생성 실패');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-gray-900">네이버톡톡 연동 추가</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <Xmark className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-600 text-sm rounded-lg">
              <WarningCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Step 1: Tenant Selection */}
          {step === 'tenant' ? (
            <>
              <Field label="테넌트 선택" required>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); doSearch(e.target.value); }}
                    placeholder="매장명, 지점번호로 검색..."
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    autoFocus
                  />
                  {searching && <div className="absolute right-3 top-1/2 -translate-y-1/2"><Spinner /></div>}
                </div>
              </Field>
              {results.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
                  {results.map(t => (
                    <button
                      key={t.tenantId}
                      onClick={() => { setSelectedTenant(t); setStep('config'); }}
                      className="w-full px-3 py-2 text-left hover:bg-gray-50 transition-colors flex items-center justify-between"
                    >
                      <div>
                        <span className="text-sm font-medium text-gray-900">{t.brandName}</span>
                        {t.branchNo && <span className="text-xs text-gray-400 ml-2">#{t.branchNo}</span>}
                      </div>
                      <span className="text-xs text-gray-400 font-mono">{t.tenantId.slice(0, 12)}...</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Selected Tenant */}
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg border border-green-200">
                <Check className="w-4 h-4 text-green-500" />
                <span className="text-sm font-medium text-green-800">{selectedTenant?.brandName}</span>
                {selectedTenant?.branchNo && <span className="text-xs text-green-600">#{selectedTenant.branchNo}</span>}
                <button onClick={() => setStep('tenant')} className="ml-auto text-xs text-green-600 hover:text-green-800">변경</button>
              </div>

              {/* Naver Config */}
              <div className="space-y-3">
                <div className="text-xs font-semibold text-gray-600 pt-2">네이버 설정</div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Inbound Secret">
                    <input
                      type="text"
                      value={form.inboundSecret}
                      onChange={e => setForm(f => ({ ...f, inboundSecret: e.target.value }))}
                      placeholder="웹훅 인증 시크릿"
                      className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </Field>
                  <Field label="API Key Secret Ref">
                    <input
                      type="text"
                      value={form.apiKeySecretRef}
                      onChange={e => setForm(f => ({ ...f, apiKeySecretRef: e.target.value }))}
                      placeholder="예: API_KEY_NAVER_0001"
                      className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </Field>
                </div>

                <div className="text-xs font-semibold text-gray-600 pt-2">Chatwoot 연결 (선택)</div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Account ID (accountId)">
                    <input
                      type="text"
                      value={form.cwAccountId}
                      onChange={e => setForm(f => ({ ...f, cwAccountId: e.target.value }))}
                      placeholder="예: 1"
                      className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </Field>
                  <Field label="Inbox ID (inboxId)">
                    <input
                      type="text"
                      value={form.cwInboxId}
                      onChange={e => setForm(f => ({ ...f, cwInboxId: e.target.value }))}
                      placeholder="예: 15"
                      className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Inbox Identifier Ref">
                    <input
                      type="text"
                      value={form.cwInboxIdentifierSecretRef}
                      onChange={e => setForm(f => ({ ...f, cwInboxIdentifierSecretRef: e.target.value }))}
                      className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </Field>
                  <Field label="Access Token Ref">
                    <input
                      type="text"
                      value={form.cwAccessTokenSecretRef}
                      onChange={e => setForm(f => ({ ...f, cwAccessTokenSecretRef: e.target.value }))}
                      className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Bot Token Ref">
                    <input
                      type="text"
                      value={form.cwBotTokenSecretRef}
                      onChange={e => setForm(f => ({ ...f, cwBotTokenSecretRef: e.target.value }))}
                      className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </Field>
                  <Field label="HMAC Secret Ref">
                    <input
                      type="text"
                      value={form.cwHmacSecretRef}
                      onChange={e => setForm(f => ({ ...f, cwHmacSecretRef: e.target.value }))}
                      className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </Field>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            취소
          </button>
          {step === 'config' && (
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-5 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {creating ? '등록 중...' : '등록'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Edit Naver Modal ───
function EditNaverModal({
  integration, onClose, onSaved,
}: {
  integration: NaverIntegration;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    inboundSecret: integration.inboundSecret || '',
    apiKeySecretRef: integration.provider?.apiKeySecretRef || '',
    status: integration.status || 'active',
    cwAccountId: String(integration.cw?.accountId || ''),
    cwInboxId: String(integration.cw?.inboxId || ''),
    cwInboxIdentifierSecretRef: integration.cw?.inboxIdentifierSecretRef || '',
    cwAccessTokenSecretRef: integration.cw?.accessTokenSecretRef || '',
    cwBotTokenSecretRef: integration.cw?.botTokenSecretRef || '',
    cwWebsiteTokenSecretRef: integration.cw?.websiteTokenSecretRef || '',
    cwHmacSecretRef: integration.cw?.hmacSecretRef || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/naver-integrations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId: integration.integrationId,
          inboundSecret: form.inboundSecret || null,
          status: form.status,
          provider: { apiKeySecretRef: form.apiKeySecretRef || null },
          cw: {
            accountId: parseInt(form.cwAccountId) || 0,
            inboxId: parseInt(form.cwInboxId) || 0,
            type: 'api',
            inboxIdentifierSecretRef: form.cwInboxIdentifierSecretRef || null,
            accessTokenSecretRef: form.cwAccessTokenSecretRef || null,
            botTokenSecretRef: form.cwBotTokenSecretRef || null,
            websiteTokenSecretRef: form.cwWebsiteTokenSecretRef || null,
            hmacSecretRef: form.cwHmacSecretRef || null,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-gray-900">네이버 연동 수정</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <Xmark className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-600 text-sm rounded-lg">
              <WarningCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="px-3 py-2 bg-gray-50 rounded-lg">
              <span className="text-xs text-gray-400 block">테넌트</span>
              <span className="text-sm font-medium text-gray-700">{integration.tenant?.brandName || integration.tenantId}</span>
            </div>
            <div className="px-3 py-2 bg-gray-50 rounded-lg">
              <span className="text-xs text-gray-400 block">Integration ID</span>
              <span className="text-sm font-mono text-gray-700">{integration.integrationId}</span>
            </div>
          </div>

          {/* Status */}
          <Field label="상태 (status)">
            <select
              value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="paused">Paused</option>
            </select>
          </Field>

          {/* Naver Config */}
          <div className="text-xs font-semibold text-gray-600 pt-1">네이버 설정</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Inbound Secret">
              <input
                type="text"
                value={form.inboundSecret}
                onChange={e => setForm(f => ({ ...f, inboundSecret: e.target.value }))}
                className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </Field>
            <Field label="API Key Secret Ref">
              <input
                type="text"
                value={form.apiKeySecretRef}
                onChange={e => setForm(f => ({ ...f, apiKeySecretRef: e.target.value }))}
                className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </Field>
          </div>

          {/* Chatwoot */}
          <div className="text-xs font-semibold text-gray-600 pt-1">Chatwoot 연결</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Account ID">
              <input type="text" value={form.cwAccountId} onChange={e => setForm(f => ({ ...f, cwAccountId: e.target.value }))}
                className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent" />
            </Field>
            <Field label="Inbox ID">
              <input type="text" value={form.cwInboxId} onChange={e => setForm(f => ({ ...f, cwInboxId: e.target.value }))}
                className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Inbox Identifier Ref">
              <input type="text" value={form.cwInboxIdentifierSecretRef} onChange={e => setForm(f => ({ ...f, cwInboxIdentifierSecretRef: e.target.value }))}
                className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent" />
            </Field>
            <Field label="Access Token Ref">
              <input type="text" value={form.cwAccessTokenSecretRef} onChange={e => setForm(f => ({ ...f, cwAccessTokenSecretRef: e.target.value }))}
                className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bot Token Ref">
              <input type="text" value={form.cwBotTokenSecretRef} onChange={e => setForm(f => ({ ...f, cwBotTokenSecretRef: e.target.value }))}
                className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent" />
            </Field>
            <Field label="HMAC Secret Ref">
              <input type="text" value={form.cwHmacSecretRef} onChange={e => setForm(f => ({ ...f, cwHmacSecretRef: e.target.value }))}
                className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent" />
            </Field>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">취소</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 채널톡 공용 컴포넌트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ─── Channel Card ───
function ChannelCard({
  channel, expanded, onToggle, onEdit, onDelete, onTenantsChanged, saving, setSaving,
}: {
  channel: Channel;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTenantsChanged: () => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
}) {
  return (
    <div className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
            CH
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900">{channel.name}</span>
              <span className="text-xs text-gray-400 font-mono">#{channel.channelId}</span>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-gray-500">
                테넌트 {channel.tenants?.length || 0}개 연결
              </span>
              {channel.botName && (
                <span className="text-xs text-gray-400">봇: {channel.botName}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <EditPencil className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash className="w-4 h-4" />
          </button>
          {expanded ? <NavArrowUp className="w-5 h-5 text-gray-400" /> : <NavArrowDown className="w-5 h-5 text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4">
          <TenantMappingEditor
            channel={channel}
            onChanged={onTenantsChanged}
            saving={saving}
            setSaving={setSaving}
          />
        </div>
      )}
    </div>
  );
}

// ─── Tenant Mapping Editor ───
function TenantMappingEditor({
  channel, onChanged, saving, setSaving,
}: {
  channel: Channel;
  onChanged: () => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
}) {
  const [tenants, setTenants] = useState<TenantMapping[]>(channel.tenants || []);
  const [showAddForm, setShowAddForm] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [detectedChannels, setDetectedChannels] = useState<DetectedChannel[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState('');

  const updateMapping = (idx: number, patch: Partial<TenantMapping>) => {
    setTenants(prev => prev.map((t, i) => i === idx ? { ...t, ...patch } : t));
    setDirty(true);
  };

  const removeMapping = (idx: number) => {
    setTenants(prev => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const addMapping = (tenant: TenantMapping) => {
    if (tenants.some(t => t.tenantId === tenant.tenantId && t.subChannelKey === tenant.subChannelKey)) {
      alert('이미 동일한 채널 키로 매핑된 테넌트입니다');
      return;
    }
    setTenants(prev => [...prev, tenant]);
    setShowAddForm(false);
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/channels', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: channel.channelId, tenants }),
      });
      if (!res.ok) throw new Error('저장 실패');
      setDirty(false);
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : '저장 중 오류');
    } finally {
      setSaving(false);
    }
  };

  const handleDetect = async () => {
    setDetecting(true);
    setDetectError('');
    try {
      const res = await fetch('/api/admin/channels/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessKey: channel.accessKey, secretKey: channel.secretKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDetectedChannels(data.channels || []);
      if ((data.channels || []).length === 0) {
        setDetectError('감지된 멀티채널이 없습니다. 카카오/네이버 메시지가 한 건 이상 있어야 감지됩니다.');
      }
    } catch (e) {
      setDetectError(e instanceof Error ? e.message : '감지 실패');
    } finally {
      setDetecting(false);
    }
  };

  const usedKeys = new Set(tenants.map(t => t.subChannelKey));

  return (
    <div>
      {/* Detected Channels */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">멀티채널 감지</h3>
          <button
            onClick={handleDetect}
            disabled={detecting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-lg hover:bg-indigo-100 disabled:opacity-50 transition-colors"
          >
            {detecting ? <Spinner /> : <Search className="w-3.5 h-3.5" />}
            {detecting ? '감지 중...' : '연결된 채널 불러오기'}
          </button>
        </div>

        {detectError && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 text-amber-700 text-xs rounded-lg mb-2">
            <WarningCircle className="w-3.5 h-3.5 flex-shrink-0" />
            {detectError}
          </div>
        )}

        {detectedChannels.length > 0 && (
          <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg">
            {detectedChannels.map(ch => {
              const isUsed = usedKeys.has(ch.key);
              return (
                <div
                  key={ch.key}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs ${
                    isUsed
                      ? 'border-green-200 bg-green-50 text-green-600'
                      : 'border-gray-200 bg-white text-gray-700'
                  }`}
                >
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${CHANNEL_TYPE_COLOR[ch.type] || CHANNEL_TYPE_COLOR.unknown}`}>
                    {CHANNEL_TYPE_LABEL[ch.type] || ch.type}
                  </span>
                  <span className="font-medium">{ch.name}</span>
                  <span className="font-mono text-gray-400">{ch.key}</span>
                  {isUsed && <Check className="w-3 h-3 text-green-500" />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tenant Mappings */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">연결된 테넌트</h3>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? <Spinner /> : <Check className="w-3.5 h-3.5" />}
              저장
            </button>
          )}
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            테넌트 추가
          </button>
        </div>
      </div>

      {tenants.length === 0 && !showAddForm ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          연결된 테넌트가 없습니다
        </div>
      ) : (
        <div className="space-y-3">
          {(() => {
            const grouped = new Map<string, { brandName: string; entries: { idx: number; subChannelKey: string }[] }>();
            tenants.forEach((t, idx) => {
              const g = grouped.get(t.tenantId);
              if (g) { g.entries.push({ idx, subChannelKey: t.subChannelKey }); }
              else { grouped.set(t.tenantId, { brandName: t.brandName, entries: [{ idx, subChannelKey: t.subChannelKey }] }); }
            });
            return Array.from(grouped.entries()).map(([tid, { brandName, entries }]) => (
              <div key={tid} className="px-4 py-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">{brandName}</span>
                    <span className="text-xs text-gray-400 font-mono">{tid.slice(0, 12)}...</span>
                  </div>
                  <button
                    onClick={() => {
                      setTenants(prev => [...prev, { tenantId: tid, brandName, subChannelKey: '' }]);
                      setDirty(true);
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    + 채널 추가
                  </button>
                </div>
                <div className="space-y-1.5">
                  {entries.map(({ idx, subChannelKey: key }) => {
                    const detected = detectedChannels.find(dc => dc.key === key);
                    const channelType = detected?.type || (key.startsWith('appKakao') ? 'kakao' : key.startsWith('appNaverTalk') ? 'naver' : key.startsWith('appInstagram') ? 'instagram' : null);

                    return (
                      <div key={idx} className="flex items-center gap-2">
                        {channelType && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 ${CHANNEL_TYPE_COLOR[channelType] || CHANNEL_TYPE_COLOR.unknown}`}>
                            {CHANNEL_TYPE_LABEL[channelType] || channelType}
                          </span>
                        )}
                        {detectedChannels.length > 0 ? (
                          <select
                            value={key}
                            onChange={(e) => updateMapping(idx, { subChannelKey: e.target.value })}
                            className="flex-1 px-2 py-1 text-xs font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                          >
                            <option value="">선택...</option>
                            {detectedChannels.map(dc => (
                              <option key={dc.key} value={dc.key} disabled={usedKeys.has(dc.key) && key !== dc.key}>
                                {CHANNEL_TYPE_LABEL[dc.type] || dc.type} | {dc.name} ({dc.key})
                              </option>
                            ))}
                            {key && !detectedChannels.some(dc => dc.key === key) && (
                              <option value={key}>{key} (미감지)</option>
                            )}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={key}
                            onChange={(e) => updateMapping(idx, { subChannelKey: e.target.value })}
                            placeholder="subChannelKey (예: appKakao-34871)"
                            className="flex-1 px-2 py-1 text-xs font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        )}
                        <button
                          onClick={() => removeMapping(idx)}
                          className="p-1 rounded text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ));
          })()}
        </div>
      )}

      {showAddForm && (
        <AddTenantForm
          detectedChannels={detectedChannels}
          usedKeys={usedKeys}
          onAdd={addMapping}
          onCancel={() => setShowAddForm(false)}
        />
      )}
    </div>
  );
}

// ─── Add Tenant Search Form ───
function AddTenantForm({
  detectedChannels, usedKeys, onAdd, onCancel,
}: {
  detectedChannels: DetectedChannel[];
  usedKeys: Set<string>;
  onAdd: (t: TenantMapping) => void;
  onCancel: () => void;
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<TenantOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [subChannelKey, setSubChannelKey] = useState('');
  const [selected, setSelected] = useState<TenantOption | null>(null);

  const availableDetected = detectedChannels.filter(dc => !usedKeys.has(dc.key));

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/tenants?search=${encodeURIComponent(q)}&limit=10`);
      const data = await res.json();
      setResults((data.tenants || []).map((t: { tenantId: string; brandName: string; branchNo: string }) => ({
        tenantId: t.tenantId,
        brandName: t.brandName || '(이름 없음)',
        branchNo: t.branchNo || '',
      })));
    } catch { setResults([]); }
    finally { setSearching(false); }
  }, []);

  return (
    <div className="mt-3 p-4 border border-blue-200 rounded-lg bg-blue-50/50">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-700">테넌트 검색</span>
        <button onClick={onCancel} className="p-1 rounded text-gray-400 hover:text-gray-600">
          <Xmark className="w-4 h-4" />
        </button>
      </div>

      {!selected ? (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); doSearch(e.target.value); }}
              placeholder="매장명, 지점번호, 이메일로 검색..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
            {searching && <div className="absolute right-3 top-1/2 -translate-y-1/2"><Spinner /></div>}
          </div>
          {results.length > 0 && (
            <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
              {results.map(t => (
                <button
                  key={t.tenantId}
                  onClick={() => setSelected(t)}
                  className="w-full px-3 py-2 text-left hover:bg-gray-50 transition-colors flex items-center justify-between"
                >
                  <div>
                    <span className="text-sm font-medium text-gray-900">{t.brandName}</span>
                    {t.branchNo && <span className="text-xs text-gray-400 ml-2">#{t.branchNo}</span>}
                  </div>
                  <span className="text-xs text-gray-400 font-mono">{t.tenantId.slice(0, 12)}...</span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200">
            <Check className="w-4 h-4 text-green-500" />
            <span className="text-sm font-medium">{selected.brandName}</span>
            <button onClick={() => setSelected(null)} className="ml-auto text-xs text-gray-400 hover:text-gray-600">변경</button>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Sub Channel Key</label>
            {availableDetected.length > 0 ? (
              <>
                <select
                  value={subChannelKey}
                  onChange={(e) => setSubChannelKey(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                >
                  <option value="">감지된 채널에서 선택...</option>
                  {availableDetected.map(dc => (
                    <option key={dc.key} value={dc.key}>
                      {CHANNEL_TYPE_LABEL[dc.type] || dc.type} | {dc.name} ({dc.key})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">감지된 채널 목록에서 선택하거나, 아래에 직접 입력하세요</p>
                <input
                  type="text"
                  value={subChannelKey}
                  onChange={(e) => setSubChannelKey(e.target.value)}
                  placeholder="또는 직접 입력: appKakao-34871"
                  className="w-full mt-2 px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </>
            ) : (
              <>
                <input
                  type="text"
                  value={subChannelKey}
                  onChange={(e) => setSubChannelKey(e.target.value)}
                  placeholder="예: appKakao-34871"
                  className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-1">
                  {detectedChannels.length > 0
                    ? '모든 감지 채널이 이미 매핑되었습니다. 직접 입력하세요.'
                    : '"연결된 채널 불러오기" 버튼으로 자동 감지하거나 직접 입력하세요'}
                </p>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={onCancel} className="px-3 py-1.5 text-xs text-gray-600 rounded-lg hover:bg-gray-100">취소</button>
            <button
              onClick={() => {
                if (!subChannelKey.trim()) { alert('Sub Channel Key를 입력하세요'); return; }
                onAdd({
                  tenantId: selected.tenantId,
                  brandName: selected.brandName,
                  subChannelKey: subChannelKey.trim(),
                });
              }}
              className="px-4 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              추가
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Create Channel Modal ───
function CreateChannelModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    channelId: '', name: '', accessKey: '', secretKey: '', webhookToken: '', botName: '',
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!form.channelId || !form.name || !form.accessKey || !form.secretKey) {
      setError('채널 ID, 이름, Access Key, Secret Key는 필수입니다');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/admin/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : '생성 실패');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">메인 채널 등록</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <Xmark className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-600 text-sm rounded-lg">
              <WarningCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <Field label="채널 ID (channelId)" required>
            <input
              type="text"
              value={form.channelId}
              onChange={e => setForm(f => ({ ...f, channelId: e.target.value }))}
              placeholder="예: 202814"
              className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </Field>

          <Field label="채널 이름" required>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="예: 솔루토 본사 채널"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Access Key" required>
              <input
                type="password"
                value={form.accessKey}
                onChange={e => setForm(f => ({ ...f, accessKey: e.target.value }))}
                placeholder="채널톡 Access Key"
                className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </Field>
            <Field label="Secret Key" required>
              <input
                type="password"
                value={form.secretKey}
                onChange={e => setForm(f => ({ ...f, secretKey: e.target.value }))}
                placeholder="채널톡 Secret Key"
                className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Webhook Token">
              <input
                type="text"
                value={form.webhookToken}
                onChange={e => setForm(f => ({ ...f, webhookToken: e.target.value }))}
                placeholder="웹훅 인증 토큰"
                className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </Field>
            <Field label="봇 이름">
              <input
                type="text"
                value={form.botName}
                onChange={e => setForm(f => ({ ...f, botName: e.target.value }))}
                placeholder="AI Assistant"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </Field>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            취소
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {creating ? '등록 중...' : '등록'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Channel Modal ───
function EditChannelModal({ channel, onClose, onSaved }: { channel: Channel; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: channel.name,
    accessKey: channel.accessKey,
    secretKey: channel.secretKey,
    webhookToken: channel.webhookToken || '',
    botName: channel.botName || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/channels', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: channel.channelId, ...form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">채널 설정 수정</h2>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <Xmark className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-600 text-sm rounded-lg">
              <WarningCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="px-3 py-2 bg-gray-50 rounded-lg">
            <span className="text-xs text-gray-400">채널 ID</span>
            <span className="text-sm font-mono text-gray-700 ml-2">{channel.channelId}</span>
          </div>

          <Field label="채널 이름">
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Access Key">
              <input type="password" value={form.accessKey} onChange={e => setForm(f => ({ ...f, accessKey: e.target.value }))}
                className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </Field>
            <Field label="Secret Key">
              <input type="password" value={form.secretKey} onChange={e => setForm(f => ({ ...f, secretKey: e.target.value }))}
                className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Webhook Token">
              <input type="text" value={form.webhookToken} onChange={e => setForm(f => ({ ...f, webhookToken: e.target.value }))}
                className="w-full px-3 py-2 text-sm font-mono border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </Field>
            <Field label="봇 이름">
              <input type="text" value={form.botName} onChange={e => setForm(f => ({ ...f, botName: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </Field>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">취소</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Field Helper ───
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}