import { useEffect, useMemo, useState } from 'react';
import type { AdminUser, AdminUserToolset } from '@hermes/shared';

interface SkillToggle {
  name: string;
  description?: string;
  enabled: boolean;
}
import { Spinner } from '~/components/ui';
import { useAdminUser, useModels, useUpdateAdminUser } from '~/data/queries';
import { ACCENT, MONO, creditColor, creditPct, fmt, jobBadgeStyle } from './theme';
import { Avatar } from './primitives';
import { ChevronDown, CloseIcon, ClockIcon, ShieldIcon } from './icons';

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      style={{
        width: 38,
        height: 22,
        borderRadius: 999,
        cursor: 'pointer',
        position: 'relative',
        transition: 'background .2s',
        flex: 'none',
        border: 'none',
        padding: 0,
        background: on ? ACCENT : '#d4d4d8',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2.5,
          left: on ? 18.5 : 2.5,
          width: 17,
          height: 17,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left .2s',
          boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
        }}
      />
    </button>
  );
}

function TabButton({
  active,
  label,
  badge,
  onClick,
}: {
  active: boolean;
  label: string;
  badge?: number;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '11px 8px',
        background: 'transparent',
        border: 'none',
        borderBottom: active ? `2px solid ${ACCENT}` : '2px solid transparent',
        color: active ? '#18181b' : '#a1a1aa',
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        cursor: 'pointer',
        transition: 'color .15s',
        marginBottom: -1,
      }}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10.5,
            fontWeight: 600,
            color: active ? ACCENT : '#a1a1aa',
            background: active ? 'rgba(91,84,232,0.1)' : '#f4f4f6',
            borderRadius: 999,
            padding: '1px 6px',
            lineHeight: 1.5,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

export function UserDrawer({
  userId,
  onClose,
  onTopup,
  onFlash,
}: {
  userId: string;
  onClose: () => void;
  onTopup: (user: AdminUser) => void;
  onFlash: (message: string) => void;
}): JSX.Element {
  const detailQuery = useAdminUser(userId);
  const modelsQuery = useModels();
  const updateUser = useUpdateAdminUser();
  const detail = detailQuery.data;

  const [model, setModel] = useState('');
  const [instructions, setInstructions] = useState('');
  const [toolsets, setToolsets] = useState<AdminUserToolset[]>([]);
  const [skills, setSkills] = useState<SkillToggle[]>([]);
  const [composioEnabled, setComposioEnabled] = useState(false);
  const [composioApps, setComposioApps] = useState<{ slug: string; name: string; allowed: boolean }[]>([]);
  const [commands, setCommands] = useState<{ name: string; description: string; allowed: boolean }[]>([]);
  const [tab, setTab] = useState<'overview' | 'profile' | 'tools' | 'apps'>('overview');

  useEffect(() => {
    if (detail) {
      setModel(detail.model ?? '');
      setInstructions(detail.instructions ?? '');
      setToolsets(detail.toolsets);
      const enabled = new Set(detail.enabledSkills);
      setSkills(
        detail.skills.map((s) => ({
          name: s.name,
          description: s.description,
          enabled: enabled.has(s.name),
        })),
      );
      setComposioEnabled(detail.composioEnabled);
      setComposioApps(
        detail.composioCatalog.map((t) => ({ slug: t.slug, name: t.name, allowed: t.allowed })),
      );
      setCommands(
        detail.commandCatalog.map((c) => ({
          name: c.name,
          description: c.description,
          allowed: c.allowed,
        })),
      );
    }
  }, [detail]);

  const modelOptions = useMemo(() => {
    const ids = new Set(modelsQuery.data?.items.map((m) => m.id) ?? []);
    if (model) {
      ids.add(model);
    }
    return [...ids];
  }, [modelsQuery.data, model]);

  const enabledCount = toolsets.filter((t) => t.enabled).length;
  const enabledSkillCount = skills.filter((s) => s.enabled).length;
  const enabledCommandCount = commands.filter((c) => c.allowed).length;

  const save = async () => {
    await updateUser.mutateAsync({
      id: userId,
      body: {
        model: model || undefined,
        instructions: instructions.length > 0 ? instructions : null,
        enabledToolsets: toolsets.filter((t) => t.enabled).map((t) => t.name),
        enabledSkills: skills.filter((s) => s.enabled).map((s) => s.name),
        composioEnabled,
        composioToolkits: composioApps.filter((a) => a.allowed).map((a) => a.slug),
        enabledCommands: commands.filter((c) => c.allowed).map((c) => c.name),
      },
    });
    onFlash('Agent profile saved');
  };

  const toggleSuspend = async () => {
    if (!detail) {
      return;
    }
    const next = detail.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    await updateUser.mutateAsync({ id: userId, body: { status: next } });
    onFlash(next === 'SUSPENDED' ? 'User suspended' : 'User reactivated');
  };

  return (
    <>
      <div
        role="presentation"
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(24,24,27,0.35)', backdropFilter: 'blur(2px)', zIndex: 50 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 560,
          maxWidth: '94vw',
          background: '#fff',
          borderLeft: '1px solid #ebebef',
          boxShadow: '-20px 0 60px rgba(0,0,0,0.12)',
          zIndex: 51,
          overflowY: 'auto',
          color: '#18181b',
        }}
      >
        {!detail && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60, color: '#a1a1aa' }}>
            <Spinner size={22} />
          </div>
        )}

        {detail && (
          <>
            <div
              style={{
                padding: '22px 24px',
                borderBottom: '1px solid #ebebef',
                position: 'sticky',
                top: 0,
                background: '#fff',
                zIndex: 2,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 13, minWidth: 0 }}>
                  <Avatar seed={detail.id} name={detail.name} email={detail.email} size={46} />
                  <div style={{ minWidth: 0 }}>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: 18,
                        fontWeight: 600,
                        letterSpacing: '-0.015em',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {detail.name ?? detail.email}
                    </h2>
                    <div style={{ fontSize: 12.5, color: '#a1a1aa', marginTop: 2 }}>
                      {detail.email} · {detail.conversationCount} conversations
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#a1a1aa',
                    cursor: 'pointer',
                    flex: 'none',
                    border: 'none',
                    background: 'transparent',
                  }}
                >
                  <CloseIcon />
                </button>
              </div>
            </div>

            <div
              role="tablist"
              style={{
                display: 'flex',
                padding: '0 12px',
                borderBottom: '1px solid #ebebef',
                position: 'sticky',
                top: 91,
                background: '#fff',
                zIndex: 2,
              }}
            >
              <TabButton active={tab === 'overview'} label="Overview" onClick={() => setTab('overview')} />
              <TabButton active={tab === 'profile'} label="Profile" onClick={() => setTab('profile')} />
              <TabButton
                active={tab === 'tools'}
                label="Tools"
                badge={enabledCount + enabledSkillCount + enabledCommandCount}
                onClick={() => setTab('tools')}
              />
              <TabButton active={tab === 'apps'} label="Apps" onClick={() => setTab('apps')} />
            </div>

            <div style={{ padding: '20px 24px 28px' }}>
              {tab === 'overview' && (
                <>
              <div
                style={{
                  background: 'linear-gradient(180deg,rgba(91,84,232,0.06),rgba(91,84,232,0.02))',
                  border: '1px solid rgba(91,84,232,0.18)',
                  borderRadius: 14,
                  padding: '17px 18px',
                  marginBottom: 22,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#71717a', fontWeight: 500, marginBottom: 4 }}>
                      Credit balance
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                      <span
                        style={{
                          fontSize: 27,
                          fontWeight: 650,
                          letterSpacing: '-0.02em',
                          fontFamily: MONO,
                          color: creditColor(detail.credits.remaining, detail.credits.purchased),
                        }}
                      >
                        {detail.credits.remaining.toLocaleString()}
                      </span>
                      <span style={{ fontSize: 13, color: '#a1a1aa' }}>
                        of {fmt(detail.credits.purchased)} purchased
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onTopup(detail)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      background: ACCENT,
                      border: 'none',
                      borderRadius: 9,
                      padding: '9px 15px',
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      boxShadow: '0 3px 10px rgba(91,84,232,0.28)',
                    }}
                  >
                    <span style={{ fontSize: 15, lineHeight: 1, marginTop: -1 }}>+</span> Add credit
                  </button>
                </div>
                <div style={{ height: 7, borderRadius: 4, background: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${creditPct(detail.credits)}%`,
                      background: creditColor(detail.credits.remaining, detail.credits.purchased),
                      borderRadius: 4,
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 9, fontSize: 11.5, color: '#a1a1aa' }}>
                  <span>Used {detail.credits.used.toLocaleString()} total</span>
                  <span>
                    Last top-up{' '}
                    {detail.credits.lastTopupAt
                      ? new Date(detail.credits.lastTopupAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })
                      : '—'}
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: 22 }}>
                <div style={{ display: 'flex', gap: 18, marginBottom: 12 }}>
                  {[
                    { label: 'Credits used', value: detail.usage.creditsUsed.toLocaleString() },
                    { label: 'Tokens', value: fmt(detail.usage.totalTokens) },
                    { label: 'Replies', value: detail.usage.messageCount.toLocaleString() },
                  ].map((stat) => (
                    <div key={stat.label}>
                      <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 650, color: '#18181b' }}>
                        {stat.value}
                      </div>
                      <div style={{ fontSize: 11, color: '#a1a1aa', marginTop: 2 }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: '#a1a1aa', marginBottom: 6 }}>Last 14 days</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 40 }}>
                  {(() => {
                    const max = Math.max(1, ...detail.usage.chart.map((p) => p.credits));
                    return detail.usage.chart.map((p, i) => (
                      <div
                        key={p.label + i}
                        title={`${p.label} · ${p.credits.toLocaleString()} credits · ${p.messages} replies`}
                        style={{
                          flex: 1,
                          borderRadius: '3px 3px 0 0',
                          background: i === detail.usage.chart.length - 1 ? ACCENT : 'rgba(91,84,232,0.28)',
                          height: `${Math.max(3, Math.round((p.credits / max) * 100))}%`,
                        }}
                      />
                    ));
                  })()}
                </div>
              </div>

                </>
              )}

              {tab === 'profile' && (
                <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, color: ACCENT }}>
                <ShieldIcon size={15} />
                <h3
                  style={{
                    margin: 0,
                    fontSize: 13,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#52525b',
                  }}
                >
                  Agent profile
                </h3>
              </div>

              <p style={{ margin: '-4px 0 18px', fontSize: 11.5, color: '#a1a1aa', lineHeight: 1.5 }}>
                Model, persona, MCP servers, and skills all take effect on the user&apos;s next turn.
                Leave MCP servers or skills empty to inherit the full set (no restriction).
              </p>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 550, color: '#3f3f46', marginBottom: 7 }}>
                  Model
                </label>
                <div style={{ position: 'relative' }}>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    style={{
                      width: '100%',
                      appearance: 'none',
                      background: '#fff',
                      border: '1px solid #e2e2e7',
                      borderRadius: 10,
                      padding: '10px 12px',
                      color: '#18181b',
                      fontSize: 13.5,
                      fontFamily: MONO,
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {modelOptions.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    style={{
                      position: 'absolute',
                      right: 12,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      pointerEvents: 'none',
                      color: '#a1a1aa',
                    }}
                  />
                </div>
              </div>

                </>
              )}

              {tab === 'tools' && (
                <>
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
                  <label style={{ fontSize: 12.5, fontWeight: 550, color: '#3f3f46' }}>MCP servers</label>
                  <span style={{ fontSize: 11.5, color: '#a1a1aa' }}>
                    {enabledCount} of {toolsets.length} enabled
                  </span>
                </div>
                <div style={{ border: '1px solid #ebebef', borderRadius: 12, overflow: 'hidden' }}>
                  {toolsets.length === 0 && (
                    <div style={{ padding: 14, fontSize: 12.5, color: '#a1a1aa' }}>No connectors available.</div>
                  )}
                  {toolsets.map((toolset, i) => (
                    <div
                      key={toolset.name}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 11,
                        padding: '11px 13px',
                        borderBottom: i === toolsets.length - 1 ? 'none' : '1px solid #f4f4f6',
                      }}
                    >
                      <span
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 7,
                          background: 'rgba(91,84,232,0.1)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontFamily: MONO,
                          fontSize: 10.5,
                          fontWeight: 600,
                          color: ACCENT,
                          flex: 'none',
                        }}
                      >
                        {toolset.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#27272a' }}>{toolset.label}</div>
                        {toolset.description && (
                          <div
                            style={{
                              fontFamily: MONO,
                              fontSize: 11,
                              color: '#a1a1aa',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {toolset.description}
                          </div>
                        )}
                      </div>
                      <Toggle
                        on={toolset.enabled}
                        onClick={() =>
                          setToolsets((prev) =>
                            prev.map((t) => (t.name === toolset.name ? { ...t, enabled: !t.enabled } : t)),
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>

              {skills.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
                    <label style={{ fontSize: 12.5, fontWeight: 550, color: '#3f3f46' }}>Skills</label>
                    <span style={{ fontSize: 11.5, color: '#a1a1aa' }}>
                      {enabledSkillCount} of {skills.length} enabled
                    </span>
                  </div>
                  <div style={{ border: '1px solid #ebebef', borderRadius: 12, overflow: 'hidden' }}>
                    {skills.map((skill, i) => (
                      <div
                        key={skill.name}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 11,
                          padding: '11px 13px',
                          borderBottom: i === skills.length - 1 ? 'none' : '1px solid #f4f4f6',
                        }}
                      >
                        <span
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 7,
                            background: 'rgba(91,84,232,0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontFamily: MONO,
                            fontSize: 10.5,
                            fontWeight: 600,
                            color: ACCENT,
                            flex: 'none',
                          }}
                        >
                          {skill.name.slice(0, 2).toUpperCase()}
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#27272a' }}>{skill.name}</div>
                          {skill.description && (
                            <div
                              style={{
                                fontFamily: MONO,
                                fontSize: 11,
                                color: '#a1a1aa',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {skill.description}
                            </div>
                          )}
                        </div>
                        <Toggle
                          on={skill.enabled}
                          onClick={() =>
                            setSkills((prev) =>
                              prev.map((s) => (s.name === skill.name ? { ...s, enabled: !s.enabled } : s)),
                            )
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {commands.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
                    <label style={{ fontSize: 12.5, fontWeight: 550, color: '#3f3f46' }}>Slash commands</label>
                    <span style={{ fontSize: 11.5, color: '#a1a1aa' }}>
                      {enabledCommandCount} of {commands.length} enabled
                    </span>
                  </div>
                  <div style={{ border: '1px solid #ebebef', borderRadius: 12, overflow: 'hidden' }}>
                    {commands.map((command, i) => (
                      <div
                        key={command.name}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 11,
                          padding: '11px 13px',
                          borderBottom: i === commands.length - 1 ? 'none' : '1px solid #f4f4f6',
                        }}
                      >
                        <span
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 7,
                            background: 'rgba(91,84,232,0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontFamily: MONO,
                            fontSize: 13,
                            fontWeight: 700,
                            color: ACCENT,
                            flex: 'none',
                          }}
                        >
                          /
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 500, color: '#27272a' }}>
                            /{command.name}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: '#a1a1aa',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {command.description}
                          </div>
                        </div>
                        <Toggle
                          on={command.allowed}
                          onClick={() =>
                            setCommands((prev) =>
                              prev.map((c) =>
                                c.name === command.name ? { ...c, allowed: !c.allowed } : c,
                              ),
                            )
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <p style={{ margin: '8px 0 0', fontSize: 11, color: '#a1a1aa', lineHeight: 1.5 }}>
                    Leave all off to grant every enabled command (no restriction).
                  </p>
                </div>
              )}

                </>
              )}

              {tab === 'apps' && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
                  <label style={{ fontSize: 12.5, fontWeight: 550, color: '#3f3f46' }}>
                    Third-party apps (Composio)
                  </label>
                  <Toggle on={composioEnabled} onClick={() => setComposioEnabled((v) => !v)} />
                </div>
                <p style={{ margin: '0 0 9px', fontSize: 11.5, color: '#a1a1aa', lineHeight: 1.5 }}>
                  Let this user connect their own third-party accounts. Pick which apps they may connect;
                  they authenticate each one from their own settings.
                </p>
                {composioEnabled && (
                  <div style={{ border: '1px solid #ebebef', borderRadius: 12, overflow: 'hidden' }}>
                    {composioApps.map((app, i) => (
                      <div
                        key={app.slug}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 11,
                          padding: '11px 13px',
                          borderBottom: i === composioApps.length - 1 ? 'none' : '1px solid #f4f4f6',
                        }}
                      >
                        <span
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 7,
                            background: 'rgba(91,84,232,0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontFamily: MONO,
                            fontSize: 10.5,
                            fontWeight: 600,
                            color: ACCENT,
                            flex: 'none',
                          }}
                        >
                          {app.name.slice(0, 2).toUpperCase()}
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#27272a' }}>{app.name}</div>
                          <div style={{ fontFamily: MONO, fontSize: 11, color: '#a1a1aa' }}>{app.slug}</div>
                        </div>
                        <Toggle
                          on={app.allowed}
                          onClick={() =>
                            setComposioApps((prev) =>
                              prev.map((a) => (a.slug === app.slug ? { ...a, allowed: !a.allowed } : a)),
                            )
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              )}

              {tab === 'overview' && detail.jobs.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 550, color: '#3f3f46', marginBottom: 9 }}>
                    Scheduled jobs
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {detail.jobs.map((job) => (
                      <div
                        key={job.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 11,
                          padding: '11px 13px',
                          border: '1px solid #ebebef',
                          borderRadius: 11,
                        }}
                      >
                        <span
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 8,
                            background: 'rgba(91,84,232,0.08)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: ACCENT,
                            flex: 'none',
                          }}
                        >
                          <ClockIcon size={14} />
                        </span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 500, color: '#27272a' }}>{job.name}</div>
                          <div style={{ fontFamily: MONO, fontSize: 11, color: '#a1a1aa' }}>
                            {job.scheduleDisplay || '—'}
                          </div>
                        </div>
                        <span style={jobBadgeStyle(job.enabled)}>{job.enabled ? 'on' : 'paused'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tab === 'profile' && (
              <div style={{ marginBottom: 4 }}>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 550, color: '#3f3f46', marginBottom: 7 }}>
                  Persona &amp; instructions
                </label>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="System instructions for this user's agent…"
                  style={{
                    width: '100%',
                    height: 84,
                    background: '#fafafb',
                    border: '1px solid #e2e2e7',
                    borderRadius: 10,
                    padding: '11px 12px',
                    color: '#3f3f46',
                    fontSize: 13,
                    lineHeight: 1.55,
                    resize: 'none',
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
              )}
            </div>

            <div
              style={{
                display: 'flex',
                gap: 9,
                alignItems: 'center',
                padding: '14px 24px',
                borderTop: '1px solid #ebebef',
                position: 'sticky',
                bottom: 0,
                background: '#fff',
                zIndex: 2,
              }}
            >
                <button
                  type="button"
                  disabled={updateUser.isPending}
                  onClick={() => void save()}
                  style={{
                    background: ACCENT,
                    border: 'none',
                    borderRadius: 10,
                    padding: '10px 18px',
                    color: '#fff',
                    fontSize: 13.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 3px 10px rgba(91,84,232,0.28)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  {updateUser.isPending ? <Spinner size={15} /> : 'Save profile'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    background: '#fff',
                    border: '1px solid #e2e2e7',
                    borderRadius: 10,
                    padding: '10px 16px',
                    color: '#52525b',
                    fontSize: 13.5,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={updateUser.isPending}
                  onClick={() => void toggleSuspend()}
                  style={{
                    marginLeft: 'auto',
                    background: '#fff',
                    border: `1px solid ${detail.status === 'ACTIVE' ? 'rgba(220,38,38,0.25)' : 'rgba(16,185,129,0.3)'}`,
                    borderRadius: 10,
                    padding: '10px 16px',
                    color: detail.status === 'ACTIVE' ? '#dc2626' : '#059669',
                    fontSize: 13.5,
                    fontWeight: 550,
                    cursor: 'pointer',
                  }}
                >
                  {detail.status === 'ACTIVE' ? 'Suspend user' : 'Reactivate user'}
                </button>
              </div>
          </>
        )}
      </div>
    </>
  );
}
