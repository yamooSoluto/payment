'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import {
  Plus, Check, WarningCircle, NavArrowDown, Settings, RefreshDouble,
} from 'iconoir-react';
import Spinner from '@/components/admin/Spinner';

// ─── Slack Lookup Types ───
interface SlackChannel {
  id: string;
  name: string;
  purpose: string;
  memberCount: number;
  isPrivate: boolean;
}
interface SlackMember {
  id: string;
  name: string;
  realName: string;
  displayName: string;
  email: string | null;
  isBot: boolean;
  avatar: string | null;
}

// ─── Types ───
interface IntegrationCw {
  accountId: number;
  inboxId: number;
  type: string | null;
  botTokenSecretRef: string | null;
  accessTokenSecretRef: string | null;
  inboxIdentifierSecretRef: string | null;
  websiteTokenSecretRef: string | null;
  hmacSecretRef: string | null;
}

interface TenantSlack {
  botTokenSecretRef?: string | null;
  signingSecretRef?: string | null;
  defaultChannelId?: string | null;
  opsChannelId?: string | null;
  defaultMentions?: string | null;
  teamId?: string | null;
  email?: string | null;
  allowedUserIds?: string[];
  hideAdminMembers?: boolean;
  routing?: Record<string, { channelId?: string; mentions?: string }>;
}

interface Integration {
  id: string;
  integrationId: string;
  tenantId: string | null;
  branchNo: string | null;
  brandCode: string | null;
  channel: string | null;
  status: string;
  inboundSecret: string | null;
  provider: { kind: string; apiKeySecretRef: string | null; sendUrl?: string } | null;
  cw: IntegrationCw | null;
  tenant: {
    brandName: string;
    branchNo: string;
    brandCode: string;
    hasNaverAuth?: boolean;
    slack?: TenantSlack | null;
    addons?: string[];
  } | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface IntegrationConfig {
  widget: {
    cw: {
      accountId: number;
      inboxId?: number;
      type: string;
      botTokenSecretRef: string;
      accessTokenSecretRef: string;
      inboxIdentifierSecretRef?: string;
      websiteTokenSecretRef?: string;
      hmacSecretRef?: string;
    };
  };
  slack?: {
    botTokenSecretRef?: string;
    signingSecretRef?: string;
    teamId?: string;
    defaultChannelId?: string;
    opsChannelId?: string;
    defaultMentions?: string;
    allowedUserIds?: string[];
    excludeUserIds?: string[];
  };
  [key: string]: Record<string, unknown> | undefined;
}

const fetcher = (url: string) => fetch(url).then(r => r.json());

const CH_LABEL: Record<string, string> = { naver: '네이버톡톡', widget: '웹 위젯', slack: 'Slack', channeltalk: '채널톡', instagram: 'Instagram' };
const CH_ORDER: Record<string, number> = { naver: 90, widget: 91, slack: 92, channeltalk: 93 };
const CH_COLOR: Record<string, { on: string; off: string }> = {
  naver:       { on: 'text-emerald-700 bg-emerald-100 hover:bg-emerald-200', off: 'text-gray-400 bg-gray-100 hover:bg-gray-200' },
  widget:      { on: 'text-sky-700 bg-sky-100 hover:bg-sky-200',             off: 'text-gray-400 bg-gray-100 hover:bg-gray-200' },
  slack:       { on: 'text-violet-700 bg-violet-100 hover:bg-violet-200',    off: 'text-gray-400 bg-gray-100 hover:bg-gray-200' },
  channeltalk: { on: 'text-amber-700 bg-amber-100 hover:bg-amber-200',       off: 'text-gray-400 bg-gray-100 hover:bg-gray-200' },
  instagram:   { on: 'text-pink-700 bg-pink-100 hover:bg-pink-200',          off: 'text-gray-400 bg-gray-100 hover:bg-gray-200' },
};

// ─── 공통 컴포넌트 ───
function Toggle({ on, onChange, disabled }: { on: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`relative w-9 h-5 rounded-full transition-colors ${on ? 'bg-gray-900' : 'bg-gray-200'} ${disabled ? 'opacity-40' : ''}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${on ? 'translate-x-4' : ''}`} />
    </button>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-gray-300'}`} />;
}

function Field({ label, value, tooltip, warn }: { label: string; value: string; tooltip?: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] text-gray-400 mb-0.5">{label}</dt>
      <dd className={`text-[13px] font-mono truncate ${warn ? 'text-amber-600' : 'text-gray-800'}`} title={tooltip || undefined}>{value}</dd>
    </div>
  );
}

function Input({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] text-gray-500 mb-1">{label}</label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full h-9 px-3 text-[13px] font-mono bg-white border border-gray-200 rounded-lg outline-none focus:border-gray-400 transition-colors"
      />
    </div>
  );
}

function Btn({ children, onClick, variant = 'default', disabled, className = '' }: {
  children: React.ReactNode; onClick: () => void; variant?: 'default' | 'primary' | 'ghost'; disabled?: boolean; className?: string;
}) {
  const base = 'h-8 px-3.5 text-[12px] font-medium rounded-lg transition-colors disabled:opacity-40';
  const v = {
    default: 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50',
    primary: 'bg-gray-900 text-white hover:bg-gray-800',
    ghost: 'text-gray-500 hover:text-gray-700 hover:bg-gray-100',
  };
  return <button onClick={onClick} disabled={disabled} className={`${base} ${v[variant]} ${className}`}>{children}</button>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Root
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function IntegrationSetupTab() {
  const [tab, setTab] = useState<'all' | 'pending' | 'defaults'>('all');

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'all', label: '전체 연동' },
    { key: 'pending', label: '미설정' },
    { key: 'defaults', label: '기본값' },
  ];

  return (
    <div>
      <div className="flex gap-4 mb-6 border-b border-gray-200">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`pb-2.5 text-[13px] font-medium transition-all border-b-2 ${tab === key
              ? 'text-gray-900 border-gray-900'
              : 'text-gray-400 border-transparent hover:text-gray-600'
              }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'all' && <AllIntegrations />}
      {tab === 'pending' && <PendingIntegrations />}
      {tab === 'defaults' && <DefaultsEditor />}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 미설정 연동
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function PendingIntegrations() {
  const { data, error, isLoading, mutate } = useSWR<{ integrations: Integration[] }>('/api/admin/integrations?status=pending', fetcher);

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (error) return <p className="py-8 text-center text-[13px] text-red-500">불러오기 실패</p>;

  const items = (data?.integrations || []).filter(i => i.channel !== 'naver');

  if (!items.length) {
    return (
      <div className="text-center py-20">
        <Check className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
        <p className="text-[14px] font-medium text-gray-700">모두 설정 완료</p>
        <p className="text-[12px] text-gray-400 mt-1">미배정 연동이 없습니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-gray-400">{items.length}건 미배정</span>
        <button onClick={() => mutate()} className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1">
          <RefreshDouble className="w-3 h-3" /> 새로고침
        </button>
      </div>
      {items.map(ig => (
        <PendingRow key={ig.id} ig={ig} onDone={() => mutate()} />
      ))}
    </div>
  );
}

function PendingRow({ ig, onDone }: { ig: Integration; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const assign = async () => {
    const id = parseInt(val);
    if (!id || id <= 0) { setErr('유효한 ID 입력'); return; }
    setSaving(true); setErr('');
    try {
      const r = await fetch('/api/admin/integrations', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ integrationId: ig.integrationId, inboxId: id }) });
      if (!r.ok) throw new Error((await r.json()).error);
      setOpen(false); onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : '실패'); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-medium text-gray-800">{ig.tenant?.brandName || ig.tenantId}</span>
          <span className="text-[11px] text-gray-400">{CH_LABEL[ig.channel || ''] || ig.channel}</span>
        </div>
        <Btn onClick={() => setOpen(!open)} variant="primary"><Plus className="w-3 h-3 mr-1 inline" />배정</Btn>
      </div>
      {open && (
        <div className="mt-3 pt-3 border-t border-gray-50 space-y-2">
          {err && <p className="text-[11px] text-red-500">{err}</p>}
          <div className="flex gap-2">
            <input value={val} onChange={e => setVal(e.target.value)} type="number" placeholder="Inbox ID"
              className="flex-1 h-9 px-3 text-[13px] font-mono border border-gray-200 rounded-lg outline-none focus:border-gray-400" autoFocus />
            <Btn onClick={assign} disabled={saving} variant="primary">{saving ? '...' : '확인'}</Btn>
            <Btn onClick={() => setOpen(false)} variant="ghost">취소</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 전체 연동
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function AllIntegrations() {
  const { data, error, isLoading, mutate } = useSWR<{ integrations: Integration[] }>('/api/admin/integrations', fetcher);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterChannel, setFilterChannel] = useState<string | null>(null);

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (error) return <p className="py-8 text-center text-[13px] text-red-500">불러오기 실패</p>;

  const all = data?.integrations || [];
  const groups = new Map<string, { tenant: Integration['tenant']; tenantId: string; items: Integration[] }>();
  for (const ig of all) {
    const k = ig.tenantId || '-';
    const g = groups.get(k);
    if (g) g.items.push(ig); else groups.set(k, { tenant: ig.tenant, tenantId: k, items: [ig] });
  }

  const sorted = [...groups.entries()].sort(([, a], [, b]) => {
    const aTime = a.items[0]?.createdAt || '';
    const bTime = b.items[0]?.createdAt || '';
    return aTime.localeCompare(bTime);
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[12px] text-gray-400">{all.length}건 · {groups.size}개 테넌트</span>
        <button onClick={() => mutate()} className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1">
          <RefreshDouble className="w-3 h-3" /> 새로고침
        </button>
      </div>

      <div className="border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-50">
        {sorted.map(([tid, { tenant, tenantId, items }]) => {
          const open = expandedId === tid;
          const channels = [...items].sort((a, b) => (CH_ORDER[a.channel || ''] ?? 0) - (CH_ORDER[b.channel || ''] ?? 0));
          const slackCfg = (tenant?.slack || {}) as TenantSlack;

          return (
            <div key={tid} className={open ? 'bg-gray-50/70' : ''}>
              {/* 헤더 */}
              <div
                onClick={() => { setExpandedId(open ? null : tid); setFilterChannel(null); }}
                className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50/60 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <StatusDot ok={channels.every(i => i.channel === 'naver' ? !!tenant?.hasNaverAuth : !!(i.cw?.inboxId && i.cw.inboxId > 0))} />
                  <span className="text-[13px] font-semibold text-gray-800 truncate">{tenant?.brandName || tid}</span>
                  {tenant?.branchNo && <span className="text-[11px] text-gray-400">#{tenant.branchNo}</span>}
                </div>
                <div className="flex items-center gap-3 ml-6 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  {/* 채널 태그 — 클릭 시 해당 채널만 필터 */}
                  {[...channels.map(i => ({ ch: i.channel || '', ok: i.channel === 'naver' ? !!tenant?.hasNaverAuth : !!(i.cw?.inboxId && i.cw.inboxId > 0) })),
                    { ch: 'slack', ok: !!slackCfg.defaultChannelId }
                  ].sort((a, b) => (CH_ORDER[a.ch] ?? 0) - (CH_ORDER[b.ch] ?? 0)).map((b, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        if (expandedId === tid && filterChannel === b.ch) {
                          setExpandedId(null);
                          setFilterChannel(null);
                        } else {
                          setExpandedId(tid);
                          setFilterChannel(b.ch);
                        }
                      }}
                      className={`text-[12px] font-medium px-3 py-1 rounded-full transition-colors ${
                        open && filterChannel === b.ch
                          ? 'text-white bg-gray-800'
                          : (CH_COLOR[b.ch] || { on: 'text-indigo-700 bg-indigo-100 hover:bg-indigo-200', off: 'text-gray-400 bg-gray-100 hover:bg-gray-200' })[b.ok ? 'on' : 'off']
                      }`}
                    >
                      {CH_LABEL[b.ch] || b.ch}
                    </button>
                  ))}
                  <NavArrowDown className={`w-4 h-4 text-gray-300 transition-transform ${open ? 'rotate-180' : ''}`} />
                </div>
              </div>

              {/* 펼침 */}
              {open && (
                <div className="px-5 pb-5 space-y-4">
                  {channels.filter(ig => !filterChannel || ig.channel === filterChannel).map(ig => <ChannelCard key={ig.id} ig={ig} onSave={() => mutate()} />)}
                  {(!filterChannel || filterChannel === 'slack') && <SlackCard tenantId={tenantId} slack={slackCfg} addons={tenant?.addons || []} onSave={() => mutate()} />}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 채널 카드 (네이버 / 위젯) ───
function ChannelCard({ ig, onSave }: { ig: Integration; onSave: () => void }) {
  const [editing, setEditing] = useState(false);
  const [inboxId, setInboxId] = useState(String(ig.cw?.inboxId || ''));
  const [saving, setSaving] = useState(false);

  const ch = ig.channel || '';
  const cw = ig.cw;
  const isNaver = ch === 'naver';
  const connected = isNaver ? !!ig.tenant?.hasNaverAuth : !!(cw?.inboxId && cw.inboxId > 0);

  const save = async () => {
    const id = parseInt(inboxId);
    if (!id || id <= 0) return;
    setSaving(true);
    try {
      const r = await fetch('/api/admin/integrations', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ integrationId: ig.integrationId, inboxId: id }) });
      if (!r.ok) throw new Error('실패');
      setEditing(false); onSave();
    } catch { /* */ } finally { setSaving(false); }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <StatusDot ok={connected} />
          <span className="text-[13px] font-semibold text-gray-800">{CH_LABEL[ch] || ch}</span>
          <span className={`text-[11px] ${connected ? 'text-emerald-600' : 'text-gray-400'}`}>
            {connected ? '연동됨' : '미설정'}
          </span>
        </div>
        {!isNaver && (
          <Btn onClick={() => setEditing(!editing)} variant={editing ? 'ghost' : 'default'}>
            {editing ? '닫기' : '수정'}
          </Btn>
        )}
      </div>

      {/* 정보 */}
      <div className="px-5 py-4">
        {isNaver ? (
          <dl className="grid grid-cols-3 gap-y-3 gap-x-8">
            <Field label="Authorization" value={ig.tenant?.hasNaverAuth ? '설정됨 (포탈)' : '미설정'} warn={!ig.tenant?.hasNaverAuth} />
            <Field label="Inbound Secret" value={ig.inboundSecret || '-'} />
            <Field label="Status" value={ig.status} />
          </dl>
        ) : (
          <>
            <dl className="grid grid-cols-4 gap-y-3 gap-x-8">
              <Field label="Inbox ID" value={cw?.inboxId ? String(cw.inboxId) : '미설정'} warn={!cw?.inboxId} />
              <Field label="Account ID" value={cw?.accountId ? String(cw.accountId) : '-'} />
              <Field label="Type" value={cw?.type || '-'} />
              <Field label="Status" value={ig.status} />
            </dl>
            {cw?.inboxId && (cw.botTokenSecretRef || cw.websiteTokenSecretRef) && (
              <dl className="grid grid-cols-4 gap-y-3 gap-x-8 mt-3 pt-3 border-t border-gray-50">
                {cw.botTokenSecretRef && <Field label="Bot Token" value={cw.botTokenSecretRef} />}
                {cw.accessTokenSecretRef && <Field label="Access Token" value={cw.accessTokenSecretRef} />}
                {cw.websiteTokenSecretRef && <Field label="Website Token" value={cw.websiteTokenSecretRef} />}
                {cw.hmacSecretRef && <Field label="HMAC" value={cw.hmacSecretRef} />}
              </dl>
            )}
          </>
        )}
      </div>

      {/* 수정 폼 */}
      {editing && (
        <div className="px-5 py-3 border-t border-gray-50 flex items-center gap-2 bg-gray-50/50">
          <input value={inboxId} onChange={e => setInboxId(e.target.value)} type="number" placeholder="Inbox ID"
            className="w-40 h-8 px-3 text-[13px] font-mono border border-gray-200 rounded-lg outline-none focus:border-gray-400 bg-white" />
          <Btn onClick={save} disabled={saving} variant="primary">{saving ? '...' : '저장'}</Btn>
          <Btn onClick={() => setEditing(false)} variant="ghost">취소</Btn>
        </div>
      )}
    </div>
  );
}

// ─── Slack 카드 ───
interface SlackRequest {
  tenantId: string;
  teamEmails: string[];
  contactEmail: string;
  note: string;
  requestedBy: string;
  status: 'pending' | 'processing' | 'done';
  requestedAt: string | null;
}

function SlackCard({ tenantId, slack, addons, onSave }: { tenantId: string; slack: TenantSlack; addons: string[]; onSave: () => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [draft, setDraft] = useState<TenantSlack>({});

  const [channels, setChannels] = useState<SlackChannel[] | null>(null);
  const [members, setMembers] = useState<SlackMember[] | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupErr, setLookupErr] = useState('');

  // 신청 내역
  const [slackRequest, setSlackRequest] = useState<SlackRequest | null>(null);
  const [reqStatusUpdating, setReqStatusUpdating] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/slack-requests?tenantId=${tenantId}`)
      .then(r => r.json())
      .then(d => { if (d.request) setSlackRequest(d.request); })
      .catch(() => {});
  }, [tenantId]);

  const updateRequestStatus = async (status: string) => {
    setReqStatusUpdating(true);
    try {
      await fetch('/api/admin/slack-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, status }),
      });
      setSlackRequest(prev => prev ? { ...prev, status: status as SlackRequest['status'] } : null);
    } catch { /* */ }
    finally { setReqStatusUpdating(false); }
  };

  // 읽기 모드에서도 채널명/멤버명 표시를 위해 마운트 시 로드
  useEffect(() => {
    if (!channels && !lookupLoading) {
      const chId = slack.defaultChannelId || undefined;
      const memberUrl = chId
        ? `/api/admin/slack-lookup?tenantId=${tenantId}&type=members&channelId=${chId}`
        : `/api/admin/slack-lookup?tenantId=${tenantId}&type=members`;
      Promise.all([
        fetch(`/api/admin/slack-lookup?tenantId=${tenantId}&type=channels`).then(r => r.json()),
        fetch(memberUrl).then(r => r.json()),
      ]).then(([cd, md]) => {
        if (cd.channels) setChannels(cd.channels);
        if (md.members) setMembers(md.members);
      }).catch(() => { /* ignore */ });
    }
  }, [tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const enabled = addons.includes('slack');
  const connected = !!slack.defaultChannelId;

  const toggleSlack = async () => {
    setToggling(true);
    try {
      const r = await fetch('/api/admin/integrations', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenantId, toggleAddon: 'slack' }) });
      if (!r.ok) throw new Error('실패');
      onSave();
    } catch { /* */ } finally { setToggling(false); }
  };

  const loadSlack = async (chId?: string) => {
    setLookupLoading(true); setLookupErr('');
    try {
      const memberUrl = chId
        ? `/api/admin/slack-lookup?tenantId=${tenantId}&type=members&channelId=${chId}`
        : `/api/admin/slack-lookup?tenantId=${tenantId}&type=members`;
      const [cr, mr] = await Promise.all([
        fetch(`/api/admin/slack-lookup?tenantId=${tenantId}&type=channels`),
        fetch(memberUrl),
      ]);
      const cd = await cr.json(), md = await mr.json();
      if (!cr.ok) throw new Error(cd.error);
      if (!mr.ok) throw new Error(md.error);
      setChannels(cd.channels); setMembers(md.members);
    } catch (e) { setLookupErr(e instanceof Error ? e.message : '조회 실패'); }
    finally { setLookupLoading(false); }
  };

  const reloadMembers = async (chId: string) => {
    setLookupLoading(true);
    try {
      const url = chId
        ? `/api/admin/slack-lookup?tenantId=${tenantId}&type=members&channelId=${chId}`
        : `/api/admin/slack-lookup?tenantId=${tenantId}&type=members`;
      const r = await fetch(url);
      const d = await r.json();
      if (r.ok) setMembers(d.members);
    } catch { /* */ }
    finally { setLookupLoading(false); }
  };

  const startEdit = () => {
    setDraft({
      botTokenSecretRef: slack.botTokenSecretRef || '',
      signingSecretRef: slack.signingSecretRef || '',
      defaultChannelId: slack.defaultChannelId || '',
      opsChannelId: slack.opsChannelId || '',
      defaultMentions: slack.defaultMentions || '',
      teamId: slack.teamId || '',
      allowedUserIds: slack.allowedUserIds || [],
      hideAdminMembers: slack.hideAdminMembers ?? true,
      routing: slack.routing || {},
    });
    setEditing(true);
    if (!channels && !lookupLoading) setTimeout(() => loadSlack(slack.defaultChannelId || undefined), 0);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...draft };
      if (typeof payload.allowedUserIds === 'string') {
        payload.allowedUserIds = (payload.allowedUserIds as unknown as string).split(',').map(s => s.trim()).filter(Boolean);
      }
      const r = await fetch('/api/admin/integrations', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenantId, slack: payload }) });
      if (!r.ok) throw new Error('실패');
      setEditing(false); onSave();
    } catch { /* */ } finally { setSaving(false); }
  };

  const set = (k: string, v: unknown) => setDraft(p => ({ ...p, [k]: v }));
  const setRouting = (h: string, f: string, v: string) => setDraft(p => ({ ...p, routing: { ...p.routing, [h]: { ...(p.routing?.[h] || {}), [f]: v } } }));
  const delRouting = (h: string) => setDraft(p => { const r = { ...p.routing }; delete r[h]; return { ...p, routing: r }; });

  const chName = (id: string | null | undefined) => { if (!id) return ''; const c = channels?.find(x => x.id === id); return c ? `#${c.name}` : ''; };
  const mName = (id: string) => { const m = members?.find(x => x.id === id); return m ? m.displayName || m.realName : id; };
  const parseMentions = (s: string) => (s.match(/<@(U[A-Z0-9]+)>/g) || []).map(m => m.replace(/<@|>/g, ''));

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <StatusDot ok={connected} />
          <span className="text-[13px] font-semibold text-gray-800">Slack</span>
          <span className={`text-[11px] ${connected ? 'text-emerald-600' : 'text-gray-400'}`}>
            {connected ? '연동됨' : '미설정'}
          </span>
          {slack.email && <span className="text-[11px] text-gray-400 ml-1">{slack.email}</span>}
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-gray-400">서비스 활성</span>
            <Toggle on={enabled} onChange={toggleSlack} disabled={toggling} />
          </div>
          <div className="w-px h-4 bg-gray-200" />
          <Btn onClick={editing ? () => setEditing(false) : startEdit} variant={editing ? 'ghost' : 'default'}>
            {editing ? '닫기' : '수정'}
          </Btn>
        </div>
      </div>

      {/* 읽기 모드 */}
      {!editing && (
        <div className="px-5 py-4">
          <dl className="grid grid-cols-4 gap-y-3 gap-x-8">
            <Field label="Default Channel" value={slack.defaultChannelId ? (chName(slack.defaultChannelId) || slack.defaultChannelId) : '미설정'} tooltip={slack.defaultChannelId || undefined} warn={!connected} />
            <Field label="Ops Channel" value={slack.opsChannelId ? (chName(slack.opsChannelId) || slack.opsChannelId) : '-'} tooltip={slack.opsChannelId || undefined} />
            <Field label="Team ID" value={slack.teamId || '-'} />
            <Field label="Bot Token Ref" value={slack.botTokenSecretRef || '기본값'} tooltip={slack.botTokenSecretRef || '기본값 설정 사용'} />
          </dl>

          {(slack.defaultMentions || slack.allowedUserIds?.length || Object.keys(slack.routing || {}).length > 0) && (
            <div className="mt-3 pt-3 border-t border-gray-50 space-y-2">
              {slack.defaultMentions && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-400 w-24 flex-shrink-0">Mentions</span>
                  <div className="flex flex-wrap gap-1">
                    {parseMentions(slack.defaultMentions).map(uid => (
                      <span key={uid} className="px-1.5 py-0.5 bg-gray-100 rounded text-[11px] text-gray-700 font-mono">@{mName(uid)}</span>
                    ))}
                  </div>
                </div>
              )}
              {slack.allowedUserIds && slack.allowedUserIds.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-400 w-24 flex-shrink-0">Allowed</span>
                  <div className="flex flex-wrap gap-1">
                    {slack.allowedUserIds.map(uid => (
                      <span key={uid} className="px-1.5 py-0.5 bg-gray-100 rounded text-[11px] text-gray-700 font-mono">{mName(uid)}</span>
                    ))}
                  </div>
                </div>
              )}
              {slack.hideAdminMembers !== false && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-400 w-24 flex-shrink-0">본사 제외</span>
                  <span className="text-[11px] text-emerald-600">적용됨</span>
                </div>
              )}
              {Object.entries(slack.routing || {}).map(([h, r]) => (
                <div key={h} className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-400 w-24 flex-shrink-0">route.{h}</span>
                  <span className="text-[11px] font-mono text-gray-700">{r.channelId || '-'}{chName(r.channelId) ? ` ${chName(r.channelId)}` : ''}</span>
                  {r.mentions && <span className="text-[11px] text-gray-400">→ {parseMentions(r.mentions).map(u => `@${mName(u)}`).join(', ')}</span>}
                </div>
              ))}
            </div>
          )}

          {/* 신청 내역 */}
          {slackRequest && slackRequest.status !== 'done' && (
            <div className="mt-3 pt-3 border-t border-amber-100 bg-amber-50/50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${slackRequest.status === 'pending' ? 'bg-amber-400' : 'bg-blue-400'} animate-pulse`} />
                  <span className="text-[12px] font-semibold text-gray-800">
                    연동 신청 {slackRequest.status === 'pending' ? '대기' : '진행중'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {slackRequest.status === 'pending' && (
                    <button
                      onClick={() => updateRequestStatus('processing')}
                      disabled={reqStatusUpdating}
                      className="px-2 py-1 text-[11px] font-medium bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                    >
                      진행중으로 변경
                    </button>
                  )}
                  <button
                    onClick={() => updateRequestStatus('done')}
                    disabled={reqStatusUpdating}
                    className="px-2 py-1 text-[11px] font-medium bg-emerald-500 text-white rounded hover:bg-emerald-600 disabled:opacity-50"
                  >
                    완료
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <span className="text-[11px] text-gray-400 w-16 flex-shrink-0">팀원</span>
                  <div className="flex flex-wrap gap-1">
                    {slackRequest.teamEmails.map((email, i) => (
                      <span key={i} className="px-1.5 py-0.5 bg-white rounded text-[11px] text-gray-700 border border-gray-200">{email}</span>
                    ))}
                  </div>
                </div>
                {slackRequest.contactEmail && (
                  <div className="flex gap-2">
                    <span className="text-[11px] text-gray-400 w-16 flex-shrink-0">연락처</span>
                    <span className="text-[11px] text-gray-700">{slackRequest.contactEmail}</span>
                  </div>
                )}
                {slackRequest.note && (
                  <div className="flex gap-2">
                    <span className="text-[11px] text-gray-400 w-16 flex-shrink-0">요청</span>
                    <span className="text-[11px] text-gray-600">{slackRequest.note}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 수정 모드 */}
      {editing && (
        <div className="px-5 py-4 space-y-3 bg-gray-50/30">
          {lookupErr && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-100 rounded-lg text-[11px] text-amber-700">
              <WarningCircle className="w-3.5 h-3.5" /> {lookupErr}
              <button onClick={() => loadSlack(draft.defaultChannelId || undefined)} className="ml-auto underline">재시도</button>
            </div>
          )}
          {lookupLoading && <div className="text-[11px] text-gray-400 flex items-center gap-1.5"><Spinner /> 로딩 중...</div>}

          {/* 채널 + 멤버 */}
          <div className="grid grid-cols-2 gap-3">
            <ChannelPicker label="Default Channel" value={draft.defaultChannelId || ''} onChange={v => { set('defaultChannelId', v); reloadMembers(v); }} channels={channels} loading={lookupLoading} />
            <ChannelPicker label="Ops Channel" value={draft.opsChannelId || ''} onChange={v => set('opsChannelId', v)} channels={channels} loading={lookupLoading} />
            <div>
              <label className="text-[11px] text-gray-400 mb-1 block">Default Mentions</label>
              <MemberPicker selectedIds={parseMentions(String(draft.defaultMentions || ''))} onChange={ids => set('defaultMentions', ids.map(id => `<@${id}>`).join(' '))} members={members} loading={lookupLoading} />
            </div>
            <div>
              <label className="text-[11px] text-gray-400 mb-1 block">Allowed Users <span className="text-[10px] text-gray-300">(Slack 액션 권한)</span></label>
              <MemberPicker selectedIds={Array.isArray(draft.allowedUserIds) ? draft.allowedUserIds : []} onChange={ids => set('allowedUserIds', ids)} members={members} loading={lookupLoading} />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!draft.hideAdminMembers} onChange={e => set('hideAdminMembers', e.target.checked)} className="rounded border-gray-300" />
            <span className="text-[11px] text-gray-600">포탈 멤버 목록에서 본사 관리자 제외</span>
          </label>

          {/* 라우팅 */}
          <details>
            <summary className="text-[11px] text-gray-400 cursor-pointer hover:text-gray-600 flex items-center justify-between">
              <span>Routing {Object.keys(draft.routing || {}).length > 0 && <span className="text-[10px] text-gray-300">({Object.keys(draft.routing || {}).length})</span>}</span>
              <button onClick={e => { e.preventDefault(); const n = prompt('핸들러 이름'); if (n) setRouting(n, 'channelId', ''); }} className="text-[11px] text-gray-500 hover:text-gray-700">+ 추가</button>
            </summary>
            <div className="mt-2 space-y-1.5">
              {Object.entries(draft.routing || {}).map(([h, r]) => (
                <div key={h} className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-gray-600 w-14 flex-shrink-0">{h}</span>
                  <div className="flex-1"><ChannelPicker label="" value={r.channelId || ''} onChange={v => setRouting(h, 'channelId', v)} channels={channels} loading={lookupLoading} compact /></div>
                  <div className="flex-1"><MemberPicker selectedIds={parseMentions(r.mentions || '')} onChange={ids => setRouting(h, 'mentions', ids.map(id => `<@${id}>`).join(' '))} members={members} loading={lookupLoading} compact /></div>
                  <button onClick={() => delRouting(h)} className="text-[11px] text-red-400 hover:text-red-600">삭제</button>
                </div>
              ))}
            </div>
          </details>

          {/* 고급 설정 */}
          <details>
            <summary className="text-[11px] text-gray-400 cursor-pointer hover:text-gray-600">고급 설정 <span className="text-[10px]">(비워두면 기본값 적용)</span></summary>
            <div className="grid grid-cols-3 gap-3 mt-2">
              <Input label="Bot Token Ref" value={String(draft.botTokenSecretRef || '')} onChange={v => set('botTokenSecretRef', v)} placeholder="기본값 사용" />
              <Input label="Signing Secret Ref" value={String(draft.signingSecretRef || '')} onChange={v => set('signingSecretRef', v)} placeholder="기본값 사용" />
              <Input label="Team ID" value={String(draft.teamId || '')} onChange={v => set('teamId', v)} placeholder="기본값 사용" />
            </div>
          </details>

          {/* 액션 */}
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            <Btn onClick={save} disabled={saving} variant="primary">{saving ? '저장 중...' : '저장'}</Btn>
            <Btn onClick={() => setEditing(false)} variant="ghost">취소</Btn>
            {!channels && !lookupLoading && (
              <Btn onClick={() => loadSlack(draft.defaultChannelId || undefined)} className="ml-auto"><RefreshDouble className="w-3 h-3 mr-1 inline" />데이터 불러오기</Btn>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 채널 드롭다운 ───
function ChannelPicker({ label, value, onChange, channels, loading, compact }: {
  label: string; value: string; onChange: (v: string) => void; channels: SlackChannel[] | null; loading: boolean; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const sel = channels?.find(c => c.id === value);
  const list = channels?.filter(c => c.name.toLowerCase().includes(q.toLowerCase()) || c.id.includes(q)) || [];

  return (
    <div className="relative">
      {label && <label className="block text-[11px] text-gray-400 mb-1">{label}</label>}
      <button type="button" onClick={() => channels && setOpen(!open)}
        className={`w-full flex items-center justify-between bg-white border rounded-lg transition-colors ${open ? 'border-gray-400' : 'border-gray-200 hover:border-gray-300'} ${compact ? 'h-7 px-2 text-[11px]' : 'h-9 px-3 text-[12px]'} ${!channels ? 'opacity-40' : ''}`}>
        <span className={`truncate font-mono ${sel ? 'text-gray-800' : 'text-gray-400'}`}>
          {sel ? `#${sel.name}` : value || (loading ? '...' : '선택')}
        </span>
        <NavArrowDown className="w-3 h-3 text-gray-300" />
      </button>
      {open && channels && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 max-h-[220px] overflow-hidden">
            <div className="p-1.5 border-b border-gray-100">
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="검색..." className="w-full h-7 px-2 text-[11px] bg-gray-50 rounded outline-none" autoFocus />
            </div>
            <div className="overflow-y-auto max-h-[172px]">
              <button type="button" onClick={() => { onChange(''); setOpen(false); setQ(''); }} className="w-full text-left px-3 py-1.5 text-[11px] text-gray-400 hover:bg-gray-50">해제</button>
              {list.map(c => (
                <button key={c.id} type="button" onClick={() => { onChange(c.id); setOpen(false); setQ(''); }}
                  className={`w-full text-left px-3 py-1.5 text-[11px] flex items-center gap-2 hover:bg-gray-50 ${c.id === value ? 'bg-gray-50 font-medium' : ''}`}>
                  <span className="text-gray-400">{c.isPrivate ? '🔒' : '#'}</span>
                  <span className="text-gray-800">{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── 멤버 피커 ───
function MemberPicker({ selectedIds, onChange, members, loading, compact }: {
  selectedIds: string[]; onChange: (ids: string[]) => void; members: SlackMember[] | null; loading: boolean; compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const list = members?.filter(m => !m.isBot && (m.realName.toLowerCase().includes(q.toLowerCase()) || m.displayName.toLowerCase().includes(q.toLowerCase()) || m.id.includes(q) || (m.email || '').includes(q))) || [];
  const toggle = (id: string) => onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);
  const selected = selectedIds.map(id => members?.find(m => m.id === id)).filter(Boolean);

  return (
    <div className="relative">
      <div onClick={() => members && setOpen(!open)}
        className={`flex flex-wrap items-center gap-1 bg-white border rounded-lg cursor-pointer transition-colors ${open ? 'border-gray-400' : 'border-gray-200 hover:border-gray-300'} ${compact ? 'min-h-[28px] px-2 py-0.5' : 'min-h-[36px] px-3 py-1'} ${!members ? 'opacity-40' : ''}`}>
        {!selected.length && <span className="text-[11px] text-gray-400">{loading ? '...' : '선택'}</span>}
        {selected.map(m => m && (
          <span key={m.id} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-gray-100 rounded text-[10px] text-gray-700">
            {m.displayName || m.realName}
            <button type="button" onClick={e => { e.stopPropagation(); toggle(m.id); }} className="text-gray-400 hover:text-gray-600 ml-0.5">×</button>
          </span>
        ))}
      </div>
      {open && members && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 max-h-[260px] overflow-hidden min-w-[240px]">
            <div className="p-1.5 border-b border-gray-100">
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="이름, 이메일..." className="w-full h-7 px-2 text-[11px] bg-gray-50 rounded outline-none" autoFocus />
            </div>
            <div className="overflow-y-auto max-h-[212px]">
              {list.map(m => {
                const on = selectedIds.includes(m.id);
                return (
                  <button key={m.id} type="button" onClick={() => toggle(m.id)}
                    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-gray-50 ${on ? 'bg-gray-50' : ''}`}>
                    <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${on ? 'bg-gray-900 border-gray-900' : 'border-gray-300'}`}>
                      {on && <Check className="w-2.5 h-2.5 text-white" />}
                    </span>
                    <div className="min-w-0">
                      <span className="text-[11px] text-gray-800">{m.displayName || m.realName}</span>
                      {m.email && <span className="text-[10px] text-gray-400 ml-1.5">{m.email}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 기본값
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function DefaultsEditor() {
  const { data, isLoading } = useSWR<{ config: IntegrationConfig }>('/api/admin/integration-config', fetcher);
  const [config, setConfig] = useState<IntegrationConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [channels, setChannels] = useState<SlackChannel[] | null>(null);
  const [members, setMembers] = useState<SlackMember[] | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupErr, setLookupErr] = useState('');

  useEffect(() => { if (data?.config) setConfig(data.config as IntegrationConfig); }, [data]);

  const loadSlack = async () => {
    setLookupLoading(true); setLookupErr('');
    try {
      const [cr, mr] = await Promise.all([fetch('/api/admin/slack-lookup?tenantId=_defaults&type=channels'), fetch('/api/admin/slack-lookup?tenantId=_defaults&type=members')]);
      const cd = await cr.json(), md = await mr.json();
      if (!cr.ok) throw new Error(cd.error);
      if (!mr.ok) throw new Error(md.error);
      setChannels(cd.channels); setMembers(md.members);
    } catch (e) { setLookupErr(e instanceof Error ? e.message : '실패'); }
    finally { setLookupLoading(false); }
  };

  if (isLoading || !config) return <div className="flex justify-center py-16"><Spinner /></div>;

  const handleSave = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/admin/integration-config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config }) });
      if (!r.ok) throw new Error('실패');
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) { alert(e instanceof Error ? e.message : '실패'); }
    finally { setSaving(false); }
  };

  const upd = (ch: string, path: string, val: string | number | string[]) => {
    setConfig(prev => {
      if (!prev) return prev;
      const next = { ...prev };
      const c = { ...(next[ch] || {}) } as Record<string, unknown>;
      const p = path.split('.');
      if (p.length === 1) c[p[0]] = val;
      else if (p[0] === 'cw') { const cw = { ...((c.cw || {}) as Record<string, unknown>) }; cw[p[1]] = val; c.cw = cw; }
      next[ch] = c;
      return next as IntegrationConfig;
    });
  };

  const wCw = (config.widget?.cw || {}) as Record<string, unknown>;
  const sl = (config.slack || {}) as Record<string, unknown>;
  const parseMentions = (s: string) => (s.match(/<@(U[A-Z0-9]+)>/g) || []).map(m => m.replace(/<@|>/g, ''));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-semibold text-gray-800">기본값 설정</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">신규 연동 시 적용되는 기본 설정</p>
        </div>
        <Btn onClick={handleSave} disabled={saving} variant={saved ? 'default' : 'primary'}>
          {saved ? <><Check className="w-3.5 h-3.5 mr-1 inline text-emerald-500" />저장됨</> : saving ? '저장 중...' : <><Settings className="w-3.5 h-3.5 mr-1 inline" />저장</>}
        </Btn>
      </div>

      {/* Slack */}
      <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-50">
        <div className="px-5 py-3 flex items-center justify-between">
          <span className="text-[13px] font-semibold text-gray-800">Slack</span>
          {!channels && !lookupLoading && <Btn onClick={loadSlack}><RefreshDouble className="w-3 h-3 mr-1 inline" />데이터 불러오기</Btn>}
          {lookupLoading && <span className="text-[11px] text-gray-400 flex items-center gap-1"><Spinner /> 로딩...</span>}
        </div>

        {lookupErr && (
          <div className="px-5 py-2 bg-amber-50 text-[11px] text-amber-700 flex items-center gap-2">
            <WarningCircle className="w-3.5 h-3.5" /> {lookupErr} <button onClick={loadSlack} className="ml-auto underline">재시도</button>
          </div>
        )}

        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Bot Token Secret Ref" value={String(sl.botTokenSecretRef || '')} onChange={v => upd('slack', 'botTokenSecretRef', v)} placeholder="SLACK_BOT_TOKEN" />
            <Input label="Signing Secret Ref" value={String(sl.signingSecretRef || '')} onChange={v => upd('slack', 'signingSecretRef', v)} placeholder="SLACK_SIGNING_SECRET" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Default Channel</label>
              <ChannelPicker label="" value={String(sl.defaultChannelId || '')} onChange={v => upd('slack', 'defaultChannelId', v)} channels={channels} loading={lookupLoading} />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Ops Channel</label>
              <ChannelPicker label="" value={String(sl.opsChannelId || '')} onChange={v => upd('slack', 'opsChannelId', v)} channels={channels} loading={lookupLoading} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Default Mentions</label>
              <MemberPicker selectedIds={parseMentions(String(sl.defaultMentions || ''))} onChange={ids => upd('slack', 'defaultMentions', ids.map(id => `<@${id}>`).join(' '))} members={members} loading={lookupLoading} />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Allowed Users</label>
              <MemberPicker selectedIds={Array.isArray(sl.allowedUserIds) ? sl.allowedUserIds as string[] : []} onChange={ids => upd('slack', 'allowedUserIds', ids)} members={members} loading={lookupLoading} />
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">포탈 멤버 목록 제외 (본사 관리자)</label>
            <MemberPicker selectedIds={Array.isArray(sl.excludeUserIds) ? sl.excludeUserIds as string[] : []} onChange={ids => upd('slack', 'excludeUserIds', ids)} members={members} loading={lookupLoading} />
            <p className="text-[10px] text-gray-400 mt-1">선택된 멤버는 포탈 Slack 멤버 목록에서 제외됩니다</p>
          </div>
          <Input label="Team ID" value={String(sl.teamId || '')} onChange={v => upd('slack', 'teamId', v)} placeholder="T08JH3FG7KK" />
        </div>
      </div>

      {/* Widget */}
      <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-50">
        <div className="px-5 py-3">
          <span className="text-[13px] font-semibold text-gray-800">웹 위젯</span>
          <span className="text-[11px] text-gray-400 ml-2">Chatwoot</span>
        </div>
        <div className="px-5 py-4 grid grid-cols-3 gap-3">
          <Input label="Account ID" value={String(wCw.accountId || '')} onChange={v => upd('widget', 'cw.accountId', parseInt(v) || 0)} type="number" />
          <Input label="Inbox ID" value={String(wCw.inboxId || '')} onChange={v => upd('widget', 'cw.inboxId', parseInt(v) || 0)} type="number" />
          <Input label="Type" value={String(wCw.type || 'widget')} onChange={v => upd('widget', 'cw.type', v)} />
          <Input label="Bot Token Ref" value={String(wCw.botTokenSecretRef || '')} onChange={v => upd('widget', 'cw.botTokenSecretRef', v)} placeholder="BOT_YAMOO_001" />
          <Input label="Access Token Ref" value={String(wCw.accessTokenSecretRef || '')} onChange={v => upd('widget', 'cw.accessTokenSecretRef', v)} placeholder="CW_1ST_ACCESS_TOKEN" />
          <Input label="Website Token Ref" value={String(wCw.websiteTokenSecretRef || '')} onChange={v => upd('widget', 'cw.websiteTokenSecretRef', v)} placeholder="CW_WEB_TOKEN_73335" />
          <Input label="HMAC Ref" value={String(wCw.hmacSecretRef || '')} onChange={v => upd('widget', 'cw.hmacSecretRef', v)} placeholder="CW_WEB_HMAC_73335" />
        </div>
      </div>
    </div>
  );
}