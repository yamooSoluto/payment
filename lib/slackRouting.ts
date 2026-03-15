export type SlackRouteConfig = {
  channelId?: string;
  mentions?: string;
};

export type SlackConfigLike = {
  defaultChannelId?: string | null;
  opsChannelId?: string | null;
  errorChannelId?: string | null;
  defaultMentions?: string | null;
  allowedUserIds?: string[];
  excludeUserIds?: string[];
  teamId?: string | null;
  botTokenSecretRef?: string | null;
  signingSecretRef?: string | null;
  hideAdminMembers?: boolean;
  routing?: Record<string, SlackRouteConfig> | null;
};

export function normalizeSlackDraft(source: Partial<SlackConfigLike> | null | undefined) {
  const slack = (source || {}) as SlackConfigLike;
  const rawRouting =
    slack.routing && typeof slack.routing === 'object'
      ? (slack.routing as Record<string, SlackRouteConfig>)
      : {};
  const routing: Record<string, SlackRouteConfig> = {};

  for (const [handler, route] of Object.entries(rawRouting)) {
    if (!route || typeof route !== 'object') continue;
    const channelId = typeof route.channelId === 'string' ? route.channelId.trim() : '';
    const mentions = typeof route.mentions === 'string' ? route.mentions.trim() : '';
    if (!channelId && !mentions) continue;
    routing[handler] = {
      ...(channelId ? { channelId } : {}),
      ...(mentions ? { mentions } : {}),
    };
  }

  const defaultChannelId =
    typeof slack.defaultChannelId === 'string' ? slack.defaultChannelId.trim() : '';
  const defaultMentions =
    typeof slack.defaultMentions === 'string' ? slack.defaultMentions.trim() : '';
  const legacyOpsChannelId =
    typeof slack.opsChannelId === 'string' ? slack.opsChannelId.trim() : '';
  const errorChannelId =
    typeof slack.errorChannelId === 'string' ? slack.errorChannelId.trim() : '';
  const hideAdminMembers =
    typeof slack.hideAdminMembers === 'boolean' ? slack.hideAdminMembers : true;

  if (!routing.manager?.channelId && defaultChannelId) {
    routing.manager = {
      ...(routing.manager || {}),
      channelId: defaultChannelId,
      ...(routing.manager?.mentions || defaultMentions
        ? { mentions: routing.manager?.mentions || defaultMentions }
        : {}),
    };
  }

  if (!routing.op?.channelId && legacyOpsChannelId) {
    routing.op = {
      ...(routing.op || {}),
      channelId: legacyOpsChannelId,
    };
  }

  return {
    ...slack,
    defaultChannelId,
    defaultMentions,
    errorChannelId,
    hideAdminMembers,
    opsChannelId: routing.op?.channelId || '',
    routing,
  };
}

export function buildNormalizedSlackPayload(source: Partial<SlackConfigLike> | null | undefined) {
  const normalized = normalizeSlackDraft(source);
  return {
    ...normalized,
    defaultChannelId: normalized.defaultChannelId || null,
    defaultMentions: normalized.defaultMentions || null,
    errorChannelId: normalized.errorChannelId || null,
    opsChannelId: normalized.routing?.op?.channelId || null,
    allowedUserIds: Array.isArray(normalized.allowedUserIds) ? normalized.allowedUserIds : [],
    excludeUserIds: Array.isArray(normalized.excludeUserIds) ? normalized.excludeUserIds : [],
    routing: normalized.routing || {},
    teamId: normalized.teamId || null,
    botTokenSecretRef: normalized.botTokenSecretRef || null,
    signingSecretRef: normalized.signingSecretRef || null,
    hideAdminMembers: normalized.hideAdminMembers !== false,
  };
}
