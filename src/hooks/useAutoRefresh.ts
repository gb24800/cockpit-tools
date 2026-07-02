import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAccountStore } from '../stores/useAccountStore';
import { useCodexAccountStore } from '../stores/useCodexAccountStore';
import { useClaudeAccountStore } from '../stores/useClaudeAccountStore';
import { useGitHubCopilotAccountStore } from '../stores/useGitHubCopilotAccountStore';
import { useWindsurfAccountStore } from '../stores/useWindsurfAccountStore';
import { useKiroAccountStore } from '../stores/useKiroAccountStore';
import { useCursorAccountStore } from '../stores/useCursorAccountStore';
import { useGeminiAccountStore } from '../stores/useGeminiAccountStore';
import { useCodebuddyAccountStore } from '../stores/useCodebuddyAccountStore';
import { useCodebuddyCnAccountStore } from '../stores/useCodebuddyCnAccountStore';
import { useWorkbuddyAccountStore } from '../stores/useWorkbuddyAccountStore';
import { useQoderAccountStore } from '../stores/useQoderAccountStore';
import { useTraeAccountStore } from '../stores/useTraeAccountStore';
import { useZedAccountStore } from '../stores/useZedAccountStore';
import { usePlatformPackageStore } from '../stores/usePlatformPackageStore';
import { getGitHubCopilotAccountDisplayEmail } from '../types/githubCopilot';
import { getWindsurfAccountDisplayEmail } from '../types/windsurf';
import { getKiroAccountDisplayEmail } from '../types/kiro';
import { getCursorAccountDisplayEmail } from '../types/cursor';
import { getGeminiAccountDisplayEmail } from '../types/gemini';
import { getClaudeAccountDisplayEmail } from '../types/claude';
import { getCodebuddyAccountDisplayEmail } from '../types/codebuddy';
import { getWorkbuddyAccountDisplayEmail } from '../types/workbuddy';
import { getQoderAccountDisplayEmail } from '../types/qoder';
import { getTraeAccountDisplayEmail } from '../types/trae';
import { getZedAccountDisplayEmail } from '../types/zed';
import {
  getAccountRefreshMinutes,
  loadCurrentAccountRefreshMinutesMap,
  type CurrentAccountRefreshPlatform,
} from '../utils/currentAccountRefresh';
import {
  createAutoRefreshScheduler,
  type AutoRefreshSchedulerHandle,
  type AutoRefreshSchedulerTask,
} from '../utils/autoRefreshScheduler';
import { getAntigravityRuntimeTarget } from '../utils/antigravityRuntimeTarget';

interface GeneralConfig {
  auto_refresh_minutes: number;
  codex_auto_refresh_minutes: number;
  claude_auto_refresh_minutes: number;
  ghcp_auto_refresh_minutes: number;
  windsurf_auto_refresh_minutes: number;
  kiro_auto_refresh_minutes: number;
  cursor_auto_refresh_minutes: number;
  gemini_auto_refresh_minutes: number;
  codebuddy_auto_refresh_minutes: number;
  codebuddy_cn_auto_refresh_minutes: number;
  workbuddy_auto_refresh_minutes: number;
  qoder_auto_refresh_minutes: number;
  trae_auto_refresh_minutes: number;
  zed_auto_refresh_minutes: number;
}

interface PlatformRefreshDescriptor {
  key: CurrentAccountRefreshPlatform;
  label: string;
  intervalMinutes: number;
  currentMinutes: number;
  allowFullRefresh?: boolean;
  fullRefreshingRef: MutableRefObject<boolean>;
  currentRefreshingRef: MutableRefObject<boolean>;
  runFullRefresh: () => Promise<void>;
  runCurrentRefresh: () => Promise<void>;
}

const STARTUP_AUTO_REFRESH_SETUP_DELAY_MS = 2500;
const AUTO_REFRESH_TICK_MS = 5_000;
const AUTO_REFRESH_MAX_CONCURRENT = 1;

function minutesToMs(minutes: number): number {
  return minutes * 60 * 1000;
}

function shouldRunFullRefresh(descriptor: PlatformRefreshDescriptor): boolean {
  return descriptor.allowFullRefresh !== false && descriptor.intervalMinutes > 0;
}

function shouldRunCurrentRefresh(descriptor: PlatformRefreshDescriptor): boolean {
  if (descriptor.currentMinutes <= 0) {
    return false;
  }

  // Codex 不再做全量配额自动刷新，但仍允许只刷新当前账号。
  if (descriptor.allowFullRefresh === false) {
    return true;
  }

  return descriptor.intervalMinutes > 0;
}

function buildEnabledPlatformsSummary(
  descriptors: PlatformRefreshDescriptor[],
): string {
  const fullSummary = descriptors
    .filter(shouldRunFullRefresh)
    .map((descriptor) => `${descriptor.key}=${descriptor.intervalMinutes}`);
  const currentSummary = descriptors
    .filter(shouldRunCurrentRefresh)
    .map((descriptor) => `${descriptor.key}:${descriptor.currentMinutes}`);

  const parts = [...fullSummary];
  if (currentSummary.length > 0) {
    parts.push(`current=${currentSummary.join('|')}`);
  }
  return parts.join(', ');
}

function resolveCurrentMinutes(
  platform: CurrentAccountRefreshPlatform,
  email: string | null,
  defaultMap: Record<CurrentAccountRefreshPlatform, number>,
): number {
  return email
    ? getAccountRefreshMinutes(platform, email, defaultMap[platform])
    : defaultMap[platform];
}

function getCurrentAccountEmails(): Record<CurrentAccountRefreshPlatform, string | null> {
  const getProviderEmail = <T extends { id: string; email?: string | null }>(
    store: { getState: () => { currentAccountId: string | null; accounts: T[] } },
    getDisplayEmail: (account: T) => string,
  ): string | null => {
    const state = store.getState();
    const account = state.accounts.find((item) => item.id === state.currentAccountId);
    if (!account) return null;
    return account.email ?? getDisplayEmail(account);
  };

  return {
    antigravity: canOpenAntigravityRuntimeTarget()
      ? useAccountStore.getState().currentAccount?.email ?? null
      : null,
    codex: usePlatformPackageStore.getState().canOpenPlatform('codex')
      ? useCodexAccountStore.getState().currentAccount?.email ?? null
      : null,
    claude: usePlatformPackageStore.getState().canOpenPlatform('claude_manager')
      ? getProviderEmail(useClaudeAccountStore, getClaudeAccountDisplayEmail)
      : null,
    ghcp: usePlatformPackageStore.getState().canOpenPlatform('github-copilot')
      ? getProviderEmail(useGitHubCopilotAccountStore, getGitHubCopilotAccountDisplayEmail)
      : null,
    windsurf: usePlatformPackageStore.getState().canOpenPlatform('windsurf')
      ? getProviderEmail(useWindsurfAccountStore, getWindsurfAccountDisplayEmail)
      : null,
    kiro: usePlatformPackageStore.getState().canOpenPlatform('kiro')
      ? getProviderEmail(useKiroAccountStore, getKiroAccountDisplayEmail)
      : null,
    cursor: usePlatformPackageStore.getState().canOpenPlatform('cursor')
      ? getProviderEmail(useCursorAccountStore, getCursorAccountDisplayEmail)
      : null,
    gemini: usePlatformPackageStore.getState().canOpenPlatform('gemini')
      ? getProviderEmail(useGeminiAccountStore, getGeminiAccountDisplayEmail)
      : null,
    codebuddy: usePlatformPackageStore.getState().canOpenPlatform('codebuddy')
      ? getProviderEmail(useCodebuddyAccountStore, getCodebuddyAccountDisplayEmail)
      : null,
    codebuddy_cn: usePlatformPackageStore.getState().canOpenPlatform('codebuddy_cn')
      ? getProviderEmail(useCodebuddyCnAccountStore, getCodebuddyAccountDisplayEmail)
      : null,
    workbuddy: usePlatformPackageStore.getState().canOpenPlatform('workbuddy')
      ? getProviderEmail(useWorkbuddyAccountStore, getWorkbuddyAccountDisplayEmail)
      : null,
    qoder: usePlatformPackageStore.getState().canOpenPlatform('qoder')
      ? getProviderEmail(useQoderAccountStore, getQoderAccountDisplayEmail)
      : null,
    trae: usePlatformPackageStore.getState().canOpenPlatform('trae')
      ? getProviderEmail(useTraeAccountStore, getTraeAccountDisplayEmail)
      : null,
    zed: usePlatformPackageStore.getState().canOpenPlatform('zed')
      ? getProviderEmail(useZedAccountStore, getZedAccountDisplayEmail)
      : null,
  };
}

function canOpenAntigravityRuntimeTarget(): boolean {
  const target = getAntigravityRuntimeTarget();
  const platformPackages = usePlatformPackageStore.getState();
  return platformPackages.canOpenPlatform(target)
    || platformPackages.canOpenPlatform('antigravity')
    || platformPackages.canOpenPlatform('antigravity_ide');
}

export function useAutoRefresh() {
  const refreshAllQuotas = useAccountStore((state) => state.refreshAllQuotas);
  const fetchAccounts = useAccountStore((state) => state.fetchAccounts);
  const fetchCurrentAccount = useAccountStore((state) => state.fetchCurrentAccount);

  const fetchCodexAccounts = useCodexAccountStore((state) => state.fetchAccounts);
  const fetchCurrentCodexAccount = useCodexAccountStore((state) => state.fetchCurrentAccount);
  const refreshAllClaudeQuotas = useClaudeAccountStore((state) => state.refreshAllTokens);
  const fetchCurrentClaudeAccountId = useClaudeAccountStore((state) => state.fetchCurrentAccountId);
  const refreshClaudeQuota = useClaudeAccountStore((state) => state.refreshToken);
  const refreshAllGhcpTokens = useGitHubCopilotAccountStore((state) => state.refreshAllTokens);
  const fetchCurrentGhcpAccountId = useGitHubCopilotAccountStore((state) => state.fetchCurrentAccountId);
  const refreshGhcpToken = useGitHubCopilotAccountStore((state) => state.refreshToken);
  const refreshAllWindsurfTokens = useWindsurfAccountStore((state) => state.refreshAllTokens);
  const fetchCurrentWindsurfAccountId = useWindsurfAccountStore((state) => state.fetchCurrentAccountId);
  const refreshWindsurfToken = useWindsurfAccountStore((state) => state.refreshToken);
  const refreshAllKiroTokens = useKiroAccountStore((state) => state.refreshAllTokens);
  const fetchCurrentKiroAccountId = useKiroAccountStore((state) => state.fetchCurrentAccountId);
  const refreshKiroToken = useKiroAccountStore((state) => state.refreshToken);
  const refreshAllCursorTokens = useCursorAccountStore((state) => state.refreshAllTokens);
  const fetchCurrentCursorAccountId = useCursorAccountStore((state) => state.fetchCurrentAccountId);
  const refreshCursorToken = useCursorAccountStore((state) => state.refreshToken);
  const refreshAllGeminiTokens = useGeminiAccountStore((state) => state.refreshAllTokens);
  const fetchCurrentGeminiAccountId = useGeminiAccountStore((state) => state.fetchCurrentAccountId);
  const refreshGeminiToken = useGeminiAccountStore((state) => state.refreshToken);
  const refreshAllCodebuddyTokens = useCodebuddyAccountStore((state) => state.refreshAllTokens);
  const fetchCurrentCodebuddyAccountId = useCodebuddyAccountStore((state) => state.fetchCurrentAccountId);
  const refreshCodebuddyToken = useCodebuddyAccountStore((state) => state.refreshToken);
  const refreshAllCodebuddyCnTokens = useCodebuddyCnAccountStore((state) => state.refreshAllTokens);
  const fetchCurrentCodebuddyCnAccountId = useCodebuddyCnAccountStore((state) => state.fetchCurrentAccountId);
  const refreshCodebuddyCnToken = useCodebuddyCnAccountStore((state) => state.refreshToken);
  const refreshAllWorkbuddyTokens = useWorkbuddyAccountStore((state) => state.refreshAllTokens);
  const fetchCurrentWorkbuddyAccountId = useWorkbuddyAccountStore((state) => state.fetchCurrentAccountId);
  const refreshWorkbuddyToken = useWorkbuddyAccountStore((state) => state.refreshToken);
  const refreshAllQoderTokens = useQoderAccountStore((state) => state.refreshAllTokens);
  const fetchCurrentQoderAccountId = useQoderAccountStore((state) => state.fetchCurrentAccountId);
  const refreshQoderToken = useQoderAccountStore((state) => state.refreshToken);
  const refreshAllTraeTokens = useTraeAccountStore((state) => state.refreshAllTokens);
  const fetchCurrentTraeAccountId = useTraeAccountStore((state) => state.fetchCurrentAccountId);
  const refreshTraeToken = useTraeAccountStore((state) => state.refreshToken);
  const refreshAllZedTokens = useZedAccountStore((state) => state.refreshAllTokens);
  const fetchCurrentZedAccountId = useZedAccountStore((state) => state.fetchCurrentAccountId);
  const refreshZedToken = useZedAccountStore((state) => state.refreshToken);

  const antigravityRefreshingRef = useRef(false);
  const antigravityCurrentRefreshingRef = useRef(false);
  const codexRefreshingRef = useRef(false);
  const codexCurrentRefreshingRef = useRef(false);
  const claudeRefreshingRef = useRef(false);
  const claudeCurrentRefreshingRef = useRef(false);
  const ghcpRefreshingRef = useRef(false);
  const ghcpCurrentRefreshingRef = useRef(false);
  const windsurfRefreshingRef = useRef(false);
  const windsurfCurrentRefreshingRef = useRef(false);
  const kiroRefreshingRef = useRef(false);
  const kiroCurrentRefreshingRef = useRef(false);
  const cursorRefreshingRef = useRef(false);
  const cursorCurrentRefreshingRef = useRef(false);
  const geminiRefreshingRef = useRef(false);
  const geminiCurrentRefreshingRef = useRef(false);
  const codebuddyRefreshingRef = useRef(false);
  const codebuddyCurrentRefreshingRef = useRef(false);
  const codebuddyCnRefreshingRef = useRef(false);
  const codebuddyCnCurrentRefreshingRef = useRef(false);
  const workbuddyRefreshingRef = useRef(false);
  const workbuddyCurrentRefreshingRef = useRef(false);
  const qoderRefreshingRef = useRef(false);
  const qoderCurrentRefreshingRef = useRef(false);
  const traeRefreshingRef = useRef(false);
  const traeCurrentRefreshingRef = useRef(false);
  const zedRefreshingRef = useRef(false);
  const zedCurrentRefreshingRef = useRef(false);

  const schedulerRef = useRef<AutoRefreshSchedulerHandle | null>(null);
  const setupRunningRef = useRef(false);
  const setupPendingRef = useRef(false);
  const destroyedRef = useRef(false);

  const stopScheduler = useCallback(() => {
    schedulerRef.current?.stop();
    schedulerRef.current = null;
  }, []);

  const executeWithGuard = useCallback(
    async (
      refreshingRef: MutableRefObject<boolean>,
      task: () => Promise<void>,
      startMessage: string | null,
      errorMessage: string,
    ) => {
      if (refreshingRef.current) {
        return;
      }

      refreshingRef.current = true;
      try {
        if (startMessage) {
          console.log(startMessage);
        }
        await task();
      } catch (error) {
        console.error(errorMessage, error);
      } finally {
        refreshingRef.current = false;
      }
    },
    [],
  );

  const setupAutoRefresh = useCallback(async () => {
    const setupStartedAt = performance.now();
    console.log('[StartupPerf][AutoRefresh] setupAutoRefresh start');

    if (destroyedRef.current) {
      return;
    }

    if (setupRunningRef.current) {
      setupPendingRef.current = true;
      return;
    }

    setupRunningRef.current = true;

    try {
      do {
        setupPendingRef.current = false;

        try {
          const config = await invoke<GeneralConfig>('get_general_config');
          if (destroyedRef.current) {
            return;
          }

          stopScheduler();

          const currentRefreshMinutesMap = loadCurrentAccountRefreshMinutesMap();
          const currentAccountEmails = getCurrentAccountEmails();
          const runProviderCurrentRefresh = async (
            fetchCurrentProviderAccountId: () => Promise<string | null>,
            refreshProviderToken: (accountId: string) => Promise<void>,
          ) => {
            const accountId = await fetchCurrentProviderAccountId();
            if (!accountId) {
              return;
            }
            await refreshProviderToken(accountId);
          };
          const optionalDescriptor = (
            enabled: boolean,
            descriptor: PlatformRefreshDescriptor,
          ): PlatformRefreshDescriptor[] => (enabled ? [descriptor] : []);

          const descriptors: PlatformRefreshDescriptor[] = [
            ...optionalDescriptor(canOpenAntigravityRuntimeTarget(), {
              key: 'antigravity',
              label: 'Antigravity IDE',
              intervalMinutes: config.auto_refresh_minutes,
              currentMinutes: resolveCurrentMinutes('antigravity', currentAccountEmails.antigravity, currentRefreshMinutesMap),
              fullRefreshingRef: antigravityRefreshingRef,
              currentRefreshingRef: antigravityCurrentRefreshingRef,
              runFullRefresh: async () => {
                await refreshAllQuotas();
              },
              runCurrentRefresh: async () => {
                if (!useAccountStore.getState().currentAccount?.id) {
                  await fetchCurrentAccount();
                }
                if (!useAccountStore.getState().currentAccount?.id) {
                  return;
                }
                await invoke('refresh_current_quota');
                await fetchAccounts();
                await fetchCurrentAccount();
              },
            }),
            ...optionalDescriptor(usePlatformPackageStore.getState().canOpenPlatform('codex'), {
              key: 'codex',
              label: 'Codex',
              intervalMinutes: config.codex_auto_refresh_minutes,
              currentMinutes: resolveCurrentMinutes('codex', currentAccountEmails.codex, currentRefreshMinutesMap),
              allowFullRefresh: false,
              fullRefreshingRef: codexRefreshingRef,
              currentRefreshingRef: codexCurrentRefreshingRef,
              runFullRefresh: async () => {},
              runCurrentRefresh: async () => {
                if (!useCodexAccountStore.getState().currentAccount?.id) {
                  await fetchCurrentCodexAccount();
                }
                if (!useCodexAccountStore.getState().currentAccount?.id) {
                  return;
                }
                await invoke('refresh_current_codex_quota');
                await fetchCodexAccounts();
                await fetchCurrentCodexAccount();
              },
            }),
            ...optionalDescriptor(usePlatformPackageStore.getState().canOpenPlatform('claude_manager'), {
              key: 'claude',
              label: 'Claude',
              intervalMinutes: config.claude_auto_refresh_minutes,
              currentMinutes: resolveCurrentMinutes('claude', currentAccountEmails.claude, currentRefreshMinutesMap),
              fullRefreshingRef: claudeRefreshingRef,
              currentRefreshingRef: claudeCurrentRefreshingRef,
              runFullRefresh: async () => {
                await refreshAllClaudeQuotas();
              },
              runCurrentRefresh: async () => {
                await runProviderCurrentRefresh(fetchCurrentClaudeAccountId, refreshClaudeQuota);
              },
            }),
            ...optionalDescriptor(usePlatformPackageStore.getState().canOpenPlatform('github-copilot'), {
              key: 'ghcp',
              label: 'GitHub Copilot',
              intervalMinutes: config.ghcp_auto_refresh_minutes,
              currentMinutes: resolveCurrentMinutes('ghcp', currentAccountEmails.ghcp, currentRefreshMinutesMap),
              fullRefreshingRef: ghcpRefreshingRef,
              currentRefreshingRef: ghcpCurrentRefreshingRef,
              runFullRefresh: async () => {
                await refreshAllGhcpTokens();
              },
              runCurrentRefresh: async () => {
                await runProviderCurrentRefresh(fetchCurrentGhcpAccountId, refreshGhcpToken);
              },
            }),
            ...optionalDescriptor(usePlatformPackageStore.getState().canOpenPlatform('windsurf'), {
              key: 'windsurf',
              label: 'Windsurf',
              intervalMinutes: config.windsurf_auto_refresh_minutes,
              currentMinutes: resolveCurrentMinutes('windsurf', currentAccountEmails.windsurf, currentRefreshMinutesMap),
              fullRefreshingRef: windsurfRefreshingRef,
              currentRefreshingRef: windsurfCurrentRefreshingRef,
              runFullRefresh: async () => {
                await refreshAllWindsurfTokens();
              },
              runCurrentRefresh: async () => {
                await runProviderCurrentRefresh(fetchCurrentWindsurfAccountId, refreshWindsurfToken);
              },
            }),
            ...optionalDescriptor(usePlatformPackageStore.getState().canOpenPlatform('kiro'), {
              key: 'kiro',
              label: 'Kiro',
              intervalMinutes: config.kiro_auto_refresh_minutes,
              currentMinutes: resolveCurrentMinutes('kiro', currentAccountEmails.kiro, currentRefreshMinutesMap),
              fullRefreshingRef: kiroRefreshingRef,
              currentRefreshingRef: kiroCurrentRefreshingRef,
              runFullRefresh: async () => {
                await refreshAllKiroTokens();
              },
              runCurrentRefresh: async () => {
                await runProviderCurrentRefresh(fetchCurrentKiroAccountId, refreshKiroToken);
              },
            }),
            ...optionalDescriptor(usePlatformPackageStore.getState().canOpenPlatform('cursor'), {
              key: 'cursor',
              label: 'Cursor',
              intervalMinutes: config.cursor_auto_refresh_minutes,
              currentMinutes: resolveCurrentMinutes('cursor', currentAccountEmails.cursor, currentRefreshMinutesMap),
              fullRefreshingRef: cursorRefreshingRef,
              currentRefreshingRef: cursorCurrentRefreshingRef,
              runFullRefresh: async () => {
                await refreshAllCursorTokens();
              },
              runCurrentRefresh: async () => {
                await runProviderCurrentRefresh(fetchCurrentCursorAccountId, refreshCursorToken);
              },
            }),
            ...optionalDescriptor(usePlatformPackageStore.getState().canOpenPlatform('gemini'), {
              key: 'gemini',
              label: 'Gemini',
              intervalMinutes: config.gemini_auto_refresh_minutes,
              currentMinutes: resolveCurrentMinutes('gemini', currentAccountEmails.gemini, currentRefreshMinutesMap),
              fullRefreshingRef: geminiRefreshingRef,
              currentRefreshingRef: geminiCurrentRefreshingRef,
              runFullRefresh: async () => {
                await refreshAllGeminiTokens();
              },
              runCurrentRefresh: async () => {
                await runProviderCurrentRefresh(fetchCurrentGeminiAccountId, refreshGeminiToken);
              },
            }),
            ...optionalDescriptor(usePlatformPackageStore.getState().canOpenPlatform('codebuddy'), {
              key: 'codebuddy',
              label: 'CodeBuddy',
              intervalMinutes: config.codebuddy_auto_refresh_minutes,
              currentMinutes: resolveCurrentMinutes('codebuddy', currentAccountEmails.codebuddy, currentRefreshMinutesMap),
              fullRefreshingRef: codebuddyRefreshingRef,
              currentRefreshingRef: codebuddyCurrentRefreshingRef,
              runFullRefresh: async () => {
                await refreshAllCodebuddyTokens();
              },
              runCurrentRefresh: async () => {
                await runProviderCurrentRefresh(fetchCurrentCodebuddyAccountId, refreshCodebuddyToken);
              },
            }),
            ...optionalDescriptor(usePlatformPackageStore.getState().canOpenPlatform('codebuddy_cn'), {
              key: 'codebuddy_cn',
              label: 'CodeBuddy CN',
              intervalMinutes: config.codebuddy_cn_auto_refresh_minutes,
              currentMinutes: resolveCurrentMinutes('codebuddy_cn', currentAccountEmails.codebuddy_cn, currentRefreshMinutesMap),
              fullRefreshingRef: codebuddyCnRefreshingRef,
              currentRefreshingRef: codebuddyCnCurrentRefreshingRef,
              runFullRefresh: async () => {
                await refreshAllCodebuddyCnTokens();
              },
              runCurrentRefresh: async () => {
                await runProviderCurrentRefresh(fetchCurrentCodebuddyCnAccountId, refreshCodebuddyCnToken);
              },
            }),
            ...optionalDescriptor(usePlatformPackageStore.getState().canOpenPlatform('workbuddy'), {
              key: 'workbuddy',
              label: 'WorkBuddy',
              intervalMinutes: config.workbuddy_auto_refresh_minutes,
              currentMinutes: resolveCurrentMinutes('workbuddy', currentAccountEmails.workbuddy, currentRefreshMinutesMap),
              fullRefreshingRef: workbuddyRefreshingRef,
              currentRefreshingRef: workbuddyCurrentRefreshingRef,
              runFullRefresh: async () => {
                await refreshAllWorkbuddyTokens();
              },
              runCurrentRefresh: async () => {
                await runProviderCurrentRefresh(fetchCurrentWorkbuddyAccountId, refreshWorkbuddyToken);
              },
            }),
            ...optionalDescriptor(usePlatformPackageStore.getState().canOpenPlatform('qoder'), {
              key: 'qoder',
              label: 'Qoder',
              intervalMinutes: config.qoder_auto_refresh_minutes,
              currentMinutes: resolveCurrentMinutes('qoder', currentAccountEmails.qoder, currentRefreshMinutesMap),
              fullRefreshingRef: qoderRefreshingRef,
              currentRefreshingRef: qoderCurrentRefreshingRef,
              runFullRefresh: async () => {
                await refreshAllQoderTokens();
              },
              runCurrentRefresh: async () => {
                await runProviderCurrentRefresh(fetchCurrentQoderAccountId, refreshQoderToken);
              },
            }),
            ...optionalDescriptor(usePlatformPackageStore.getState().canOpenPlatform('trae'), {
              key: 'trae',
              label: 'Trae',
              intervalMinutes: config.trae_auto_refresh_minutes,
              currentMinutes: resolveCurrentMinutes('trae', currentAccountEmails.trae, currentRefreshMinutesMap),
              fullRefreshingRef: traeRefreshingRef,
              currentRefreshingRef: traeCurrentRefreshingRef,
              runFullRefresh: async () => {
                await refreshAllTraeTokens();
              },
              runCurrentRefresh: async () => {
                await runProviderCurrentRefresh(fetchCurrentTraeAccountId, refreshTraeToken);
              },
            }),
            ...optionalDescriptor(usePlatformPackageStore.getState().canOpenPlatform('zed'), {
              key: 'zed',
              label: 'Zed',
              intervalMinutes: config.zed_auto_refresh_minutes,
              currentMinutes: resolveCurrentMinutes('zed', currentAccountEmails.zed, currentRefreshMinutesMap),
              fullRefreshingRef: zedRefreshingRef,
              currentRefreshingRef: zedCurrentRefreshingRef,
              runFullRefresh: async () => {
                await refreshAllZedTokens();
              },
              runCurrentRefresh: async () => {
                await runProviderCurrentRefresh(fetchCurrentZedAccountId, refreshZedToken);
              },
            }),
          ];

          const tasks: AutoRefreshSchedulerTask[] = [];
          for (const descriptor of descriptors) {
            if (shouldRunFullRefresh(descriptor)) {
              tasks.push({
                key: `full:${descriptor.key}`,
                label: `${descriptor.label} 全量刷新`,
                intervalMs: minutesToMs(descriptor.intervalMinutes),
                run: () =>
                  executeWithGuard(
                    descriptor.fullRefreshingRef,
                    descriptor.runFullRefresh,
                    `[AutoRefresh] 触发 ${descriptor.label} 刷新...`,
                    `[AutoRefresh] ${descriptor.label} 刷新失败:`,
                  ),
              });
            }

            if (shouldRunCurrentRefresh(descriptor)) {
              tasks.push({
                key: `current:${descriptor.key}`,
                label: `${descriptor.label} 当前账号刷新`,
                intervalMs: minutesToMs(descriptor.currentMinutes),
                shouldSkip: () => descriptor.fullRefreshingRef.current,
                run: () =>
                  executeWithGuard(
                    descriptor.currentRefreshingRef,
                    descriptor.runCurrentRefresh,
                    null,
                    `[AutoRefresh] ${descriptor.label} 当前账号刷新失败:`,
                  ),
              });
            }
          }

          if (tasks.length > 0) {
            const scheduler = createAutoRefreshScheduler(tasks, {
              tickMs: AUTO_REFRESH_TICK_MS,
              maxConcurrent: AUTO_REFRESH_MAX_CONCURRENT,
            });
            scheduler.start();
            schedulerRef.current = scheduler;
          }

          console.log(
            `[StartupPerf][AutoRefresh] setupAutoRefresh completed in ${(performance.now() - setupStartedAt).toFixed(2)}ms; enabled=${buildEnabledPlatformsSummary(descriptors) || 'none'}`,
          );
        } catch (err) {
          console.error('[AutoRefresh] 加载配置失败:', err);
        }
      } while (setupPendingRef.current && !destroyedRef.current);
    } finally {
      setupRunningRef.current = false;
    }
  }, [
    executeWithGuard,
    fetchAccounts,
    fetchCodexAccounts,
    fetchCurrentAccount,
    fetchCurrentClaudeAccountId,
    fetchCurrentCodebuddyAccountId,
    fetchCurrentCodebuddyCnAccountId,
    fetchCurrentCodexAccount,
    fetchCurrentCursorAccountId,
    fetchCurrentGeminiAccountId,
    fetchCurrentGhcpAccountId,
    fetchCurrentKiroAccountId,
    fetchCurrentQoderAccountId,
    fetchCurrentTraeAccountId,
    fetchCurrentWindsurfAccountId,
    fetchCurrentWorkbuddyAccountId,
    fetchCurrentZedAccountId,
    refreshAllClaudeQuotas,
    refreshAllCodebuddyCnTokens,
    refreshAllCodebuddyTokens,
    refreshAllCursorTokens,
    refreshAllGeminiTokens,
    refreshAllGhcpTokens,
    refreshAllKiroTokens,
    refreshAllQuotas,
    refreshAllQoderTokens,
    refreshAllTraeTokens,
    refreshAllWindsurfTokens,
    refreshAllWorkbuddyTokens,
    refreshAllZedTokens,
    refreshClaudeQuota,
    refreshCodebuddyCnToken,
    refreshCodebuddyToken,
    refreshCursorToken,
    refreshGeminiToken,
    refreshGhcpToken,
    refreshKiroToken,
    refreshQoderToken,
    refreshTraeToken,
    refreshWindsurfToken,
    refreshWorkbuddyToken,
    refreshZedToken,
    stopScheduler,
  ]);

  useEffect(() => {
    destroyedRef.current = false;
    let startupTimer = window.setTimeout(() => {
      startupTimer = 0;
      void setupAutoRefresh();
    }, STARTUP_AUTO_REFRESH_SETUP_DELAY_MS);

    const handleConfigUpdate = () => {
      if (startupTimer) {
        window.clearTimeout(startupTimer);
        startupTimer = 0;
      }
      void setupAutoRefresh();
    };

    window.addEventListener('config-updated', handleConfigUpdate);
    window.addEventListener('agtools:platform-package-changed', handleConfigUpdate);

    return () => {
      destroyedRef.current = true;
      setupPendingRef.current = false;
      if (startupTimer) {
        window.clearTimeout(startupTimer);
      }
      stopScheduler();
      window.removeEventListener('config-updated', handleConfigUpdate);
      window.removeEventListener('agtools:platform-package-changed', handleConfigUpdate);
    };
  }, [setupAutoRefresh, stopScheduler]);
}
