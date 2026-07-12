import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, Copy, Play, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ModalErrorMessage } from "../components/ModalErrorMessage";
import { SingleSelectDropdown } from "../components/SingleSelectDropdown";
import {
  PlatformOverviewTabsHeader,
  type PlatformOverviewTab,
} from "../components/platform/PlatformOverviewTabsHeader";
import {
  CodebuddySuiteAccountsSharedView,
  type CodebuddySuiteAccountsPlatformConfig,
} from "../components/codebuddy-suite/CodebuddySuiteAccountsSharedView";
import { useProviderAccountsPage } from "../hooks/useProviderAccountsPage";
import { useEscClose } from "../hooks/useEscClose";
import { useLaunchTerminalOptions } from "../hooks/useLaunchTerminalOptions";
import * as grokInstanceService from "../services/grokInstanceService";
import * as grokService from "../services/grokService";
import { useGrokAccountStore } from "../stores/useGrokAccountStore";
import {
  getGrokAccountDisplayEmail,
  getGrokPlanBadge,
  getGrokPlanRawValue,
  getGrokQuotaGroups,
  getGrokUsage,
  hasGrokQuotaData,
  type GrokAccount,
} from "../types/grok";
import { compareCurrentAccountFirst } from "../utils/currentAccountSort";
import { GrokInstancesContent } from "./GrokInstancesPage";

const FLOW_NOTICE_KEY = "agtools.grok.flow_notice_collapsed";
const CURRENT_ACCOUNT_KEY = "agtools.grok.current_account_id";
const GROK_CLI_INSTALL_COMMAND_UNIX =
  "curl -fsSL https://x.ai/cli/install.sh | bash";
const GROK_CLI_INSTALL_COMMAND_WINDOWS =
  "irm https://x.ai/cli/install.ps1 | iex";

function getGrokCliInstallCommand(): string {
  if (typeof navigator === "undefined") {
    return GROK_CLI_INSTALL_COMMAND_UNIX;
  }
  const platform = `${navigator.platform || ""} ${navigator.userAgent || ""}`;
  return /win/i.test(platform)
    ? GROK_CLI_INSTALL_COMMAND_WINDOWS
    : GROK_CLI_INSTALL_COMMAND_UNIX;
}

function getGrokReauthorizationReason(account: GrokAccount): string | null {
  const reason = account.status_reason?.trim() || "";
  const normalized = `${account.status || ""} ${reason}`.toLowerCase();
  if (
    account.status === "reauth_required" ||
    normalized.includes("invalid_grant") ||
    normalized.includes("refresh token has been revoked") ||
    normalized.includes("refresh_token 为空") ||
    normalized.includes("access_denied")
  ) {
    return reason || "invalid_grant";
  }
  return null;
}

interface GrokAccountLaunchModalState {
  instanceId: string;
  accountEmail: string;
  launchCommand: string;
  copied: boolean;
  executing: boolean;
  executeMessage: string | null;
  executeError: string | null;
  errorScrollKey: number;
}

export function GrokAccountsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<PlatformOverviewTab>("overview");
  const [launchModal, setLaunchModal] =
    useState<GrokAccountLaunchModalState | null>(null);
  const { terminalOptions, selectedTerminal, setSelectedTerminal } =
    useLaunchTerminalOptions();
  const grokCliInstallCommand = useMemo(() => getGrokCliInstallCommand(), []);
  const [installCommandCopied, setInstallCommandCopied] = useState(false);
  const [installExecuting, setInstallExecuting] = useState(false);
  const [installOpened, setInstallOpened] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installErrorScrollKey, setInstallErrorScrollKey] = useState(0);
  const store = useGrokAccountStore();
  const [reauthTargetAccount, setReauthTargetAccount] =
    useState<GrokAccount | null>(null);

  useEscClose(!!launchModal, () => setLaunchModal(null));

  const page = useProviderAccountsPage<GrokAccount>({
    platformKey: "grok",
    oauthLogPrefix: "GrokOAuth",
    flowNoticeCollapsedKey: FLOW_NOTICE_KEY,
    currentAccountIdKey: CURRENT_ACCOUNT_KEY,
    exportFilePrefix: "grok_accounts",
    oauthTabKeys: ["oauth"],
    store: {
      accounts: store.accounts,
      currentAccountId: store.currentAccountId,
      loading: store.loading,
      error: store.error,
      fetchAccounts: store.fetchAccounts,
      fetchCurrentAccountId: store.fetchCurrentAccountId,
      deleteAccounts: store.deleteAccounts,
      refreshToken: store.refreshToken,
      refreshAllTokens: store.refreshAllTokens,
      setCurrentAccountId: store.setCurrentAccountId,
      updateAccountTags: store.updateAccountTags,
    },
    oauthService: {
      startLogin: grokService.startGrokOAuthLogin,
      completeLogin: (loginId) =>
        grokService.completeGrokOAuthLogin(
          loginId,
          reauthTargetAccount?.id ?? null,
        ),
      cancelLogin: grokService.cancelGrokOAuthLogin,
    },
    dataService: {
      importFromJson: grokService.importGrokFromJson,
      importFromLocal: grokService.importGrokFromLocal,
      exportAccounts: grokService.exportGrokAccounts,
      injectToVSCode: grokService.switchGrokAccount,
    },
    getDisplayEmail: getGrokAccountDisplayEmail,
    onInjectSuccess: async ({ accountId, account, displayEmail }) => {
      const accountEmail = account
        ? getGrokAccountDisplayEmail(account)
        : displayEmail || accountId;
      try {
        const launchInfo =
          await grokInstanceService.getGrokInstanceLaunchCommand("__default__");
        setLaunchModal({
          instanceId: launchInfo.instanceId || "__default__",
          accountEmail,
          launchCommand: launchInfo.launchCommand,
          copied: false,
          executing: false,
          executeMessage: null,
          executeError: null,
          errorScrollKey: 0,
        });
      } catch (error) {
        setLaunchModal({
          instanceId: "__default__",
          accountEmail,
          launchCommand: "",
          copied: false,
          executing: false,
          executeMessage: null,
          executeError: String(error),
          errorScrollKey: 1,
        });
      }
    },
    resolveOauthSuccessMessage: () =>
      t("grok.oauth.success", "Grok OAuth 登录成功"),
  });

  useEffect(() => {
    if (!page.showAddModal) {
      setReauthTargetAccount(null);
    }
  }, [page.showAddModal]);

  const handleReauthorize = useCallback(
    (account: GrokAccount) => {
      setReauthTargetAccount(account);
      page.openAddModal("oauth");
    },
    [page.openAddModal],
  );

  const handleCopyLaunchCommand = async () => {
    if (!launchModal?.launchCommand) return;
    try {
      await navigator.clipboard.writeText(launchModal.launchCommand);
      setLaunchModal((current) =>
        current ? { ...current, copied: true, executeError: null } : current,
      );
      window.setTimeout(() => {
        setLaunchModal((current) =>
          current ? { ...current, copied: false } : current,
        );
      }, 1200);
    } catch {
      setLaunchModal((current) =>
        current
          ? {
              ...current,
              executeError: t(
                "common.shared.export.copyFailed",
                "复制失败，请手动复制",
              ),
              errorScrollKey: current.errorScrollKey + 1,
            }
          : current,
      );
    }
  };

  const handleExecuteInTerminal = async () => {
    if (!launchModal || launchModal.executing) return;
    setLaunchModal((current) =>
      current
        ? {
            ...current,
            executing: true,
            executeError: null,
            executeMessage: null,
          }
        : current,
    );
    try {
      const result = await grokInstanceService.executeGrokInstanceLaunchCommand(
        launchModal.instanceId,
        selectedTerminal,
      );
      setLaunchModal((current) =>
        current
          ? {
              ...current,
              executing: false,
              executeMessage: result,
            }
          : current,
      );
    } catch (error) {
      setLaunchModal((current) =>
        current
          ? {
              ...current,
              executing: false,
              executeError: String(error),
              errorScrollKey: current.errorScrollKey + 1,
            }
          : current,
      );
    }
  };

  const handleTerminalChange = (terminal: string) => {
    setSelectedTerminal(terminal);
    setLaunchModal((current) =>
      current
        ? { ...current, executeError: null, executeMessage: null }
        : current,
    );
  };

  const handleInstallTerminalChange = (terminal: string) => {
    setSelectedTerminal(terminal);
    setInstallError(null);
    setInstallOpened(false);
  };

  const reportInstallError = (message: string) => {
    setInstallError(message);
    setInstallErrorScrollKey((current) => current + 1);
  };

  const handleCopyInstallCommand = async () => {
    setInstallError(null);
    setInstallCommandCopied(false);
    try {
      await navigator.clipboard.writeText(grokCliInstallCommand);
      setInstallCommandCopied(true);
      window.setTimeout(() => setInstallCommandCopied(false), 1200);
    } catch {
      reportInstallError(
        t("common.shared.export.copyFailed", "复制失败，请手动复制"),
      );
    }
  };

  const handleExecuteInstallCommand = async () => {
    if (installExecuting) return;
    setInstallError(null);
    setInstallOpened(false);
    setInstallExecuting(true);
    try {
      await grokInstanceService.executeGrokCliInstallCommand(selectedTerminal);
      setInstallOpened(true);
    } catch (error) {
      reportInstallError(String(error));
    } finally {
      setInstallExecuting(false);
    }
  };

  const renderGrokCliInstallGuide = () => (
    <div className="grok-cli-install-guide">
      <strong>{t("grok.instances.installCommand", "官方安装命令")}</strong>
      <p>
        {t(
          "grok.instances.installLaunchHint",
          "可在终端运行以下官方命令，安装完成后重新点击终端执行。",
        )}
      </p>
      <div className="grok-cli-install-command">
        <code>{grokCliInstallCommand}</code>
        <button
          type="button"
          className="btn btn-secondary icon-only"
          onClick={() => void handleCopyInstallCommand()}
          title={
            installCommandCopied
              ? t("common.success", "成功")
              : t("common.copy", "复制")
          }
          aria-label={t("common.copy", "复制")}
        >
          {installCommandCopied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <div className="grok-cli-install-actions">
        <div className="grok-cli-install-terminal">
          <label>{t("instances.launchDialog.terminal", "终端")}</label>
          <SingleSelectDropdown
            value={selectedTerminal}
            onChange={handleInstallTerminalChange}
            options={terminalOptions}
            disabled={installExecuting || !!launchModal?.executing}
          />
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void handleExecuteInstallCommand()}
          disabled={installExecuting || !!launchModal?.executing}
        >
          <Play size={14} />
          {installExecuting
            ? t("common.loading", "加载中...")
            : t("grok.instances.runInTerminal", "终端执行")}
        </button>
      </div>
      {installOpened && (
        <div className="add-status success">
          <Check size={14} />
          <span>{t("common.success", "成功")}</span>
        </div>
      )}
      <ModalErrorMessage
        message={installError}
        scrollKey={installErrorScrollKey}
      />
    </div>
  );

  const accountsForInstances = useMemo(
    () =>
      [...store.accounts].sort((left, right) => {
        const current = compareCurrentAccountFirst(
          left.id,
          right.id,
          store.currentAccountId,
        );
        if (current !== 0) return current;
        const createdDiff = right.created_at - left.created_at;
        return page.sortDirection === "desc" ? createdDiff : -createdDiff;
      }),
    [page.sortDirection, store.accounts, store.currentAccountId],
  );

  const platformConfig: CodebuddySuiteAccountsPlatformConfig<GrokAccount> = {
    pageClassName: "grok-accounts-page",
    quickSettingsType: "grok",
    searchPlaceholderKey: "grok.search",
    searchPlaceholderDefault: "搜索 Grok CLI 账号...",
    flowNotice: {
      titleKey: "grok.flowNotice.title",
      titleDefault: "Grok CLI 账号管理说明",
      descKey: "grok.flowNotice.desc",
      descDefault:
        "Cockpit 按 Grok CLI 官方凭据格式管理账号，用于默认客户端真实切号和独立实例绑定。",
      permissionKey: "grok.flowNotice.permission",
      permissionDefault:
        "本地范围：读取默认 ~/.grok/auth.json，并管理 Cockpit 内的独立 GROK_HOME 账号目录。",
      networkKey: "grok.flowNotice.network",
      networkDefault:
        "网络范围：OAuth 授权、凭据刷新及账号用量查询；不会上传凭据到 Cockpit 服务。",
    },
    noAccountsKey: "grok.empty",
    noAccountsDefault: "暂无 Grok CLI 账号",
    addAccountTitleKey: "grok.addAccount",
    addAccountTitleDefault: "添加 Grok CLI 账号",
    oauthDescKey: "grok.oauth.desc",
    oauthDescDefault: "打开 xAI 授权页并输入设备验证码，完成后账号会自动保存。",
    oauthFeatureCardClassName: "grok-oauth-feature-card",
    oauthFeatureTitleKey: "grok.oauth.title",
    oauthFeatureTitleDefault: "Grok Device OAuth",
    oauthFeatureItem1Key: "grok.oauth.item1",
    oauthFeatureItem1Default:
      "使用 Grok CLI 官方 device flow，不占用本地回调端口。",
    oauthFeatureItem2Key: "grok.oauth.item2",
    oauthFeatureItem2Default:
      "授权成功后保存独立 GROK_HOME，并维护凭据有效状态。",
    oauthFeatureItem3Key: "grok.oauth.item3",
    oauthFeatureItem3Default: "账号可用于默认 CLI 切号和相互隔离的多开实例。",
    oauthUrlInputPlaceholderKey: "grok.oauth.urlPlaceholder",
    oauthUrlInputPlaceholderDefault: "Grok OAuth 授权地址",
    oauthWaitingKey: "grok.oauth.waiting",
    oauthWaitingDefault: "等待 Grok OAuth 授权...",
    oauthOpenButtonKey: "grok.oauth.openWindow",
    oauthOpenButtonDefault: "打开授权页",
    tokenTabLabelKey: "grok.import.pasteTab",
    tokenTabLabelDefault: "粘贴 JSON",
    tokenDescKey: "grok.import.pasteDesc",
    tokenDescDefault:
      "粘贴 Grok CLI 官方 auth.json；凭据仅在本机后端处理。Cockpit 导出仅含脱敏元数据，不能用于恢复登录。",
    tokenInputPlaceholderKey: "grok.import.pastePlaceholder",
    tokenInputPlaceholderDefault: "粘贴 Grok 账号 JSON",
    tokenSubmitLabelKey: "grok.import.pasteAction",
    tokenSubmitLabelDefault: "导入 JSON",
    tokenInputSecret: true,
    importLocalDescKey: "grok.import.localDesc",
    importLocalDescDefault:
      "从默认 ~/.grok/auth.json 导入当前账号；选择文件时应使用 Grok CLI 官方 auth.json。",
    importLocalClientKey: "grok.import.localClient",
    importLocalClientDefault: "从本机 Grok CLI 导入",
    getDisplayEmail: getGrokAccountDisplayEmail,
    getPlanBadge: getGrokPlanBadge,
    getPlanBadgeTitle: getGrokPlanRawValue,
    getPlanBadgeClass: (planBadge) => {
      if (planBadge === "Free") return "free";
      if (planBadge === "--") return "unknown";
      return "pro";
    },
    getSearchText: (account) =>
      [
        getGrokAccountDisplayEmail(account),
        account.first_name,
        account.last_name,
        account.principal_id,
        account.team_id,
        account.quota?.subscriptionStatus,
        getGrokPlanBadge(account),
      ]
        .filter(Boolean)
        .join(" "),
    getUsage: getGrokUsage,
    getQuotaGroups: getGrokQuotaGroups,
    hasQuotaData: (account) => hasGrokQuotaData(account),
    usagePrefix: "grok",
    quotaPrefix: "grok",
    tableUsageClassName: "grok-table-usage",
    showMfaQuickCode: false,
    getReauthorizationReason: getGrokReauthorizationReason,
    reauthorizingAccount: reauthTargetAccount,
    onReauthorize: handleReauthorize,
  };

  return (
    <div className="ghcp-accounts-page grok-accounts-page">
      <PlatformOverviewTabsHeader
        platform="grok"
        active={activeTab}
        onTabChange={setActiveTab}
      />
      {activeTab === "instances" ? (
        <GrokInstancesContent accountsForSelect={accountsForInstances} />
      ) : (
        <CodebuddySuiteAccountsSharedView
          accounts={store.accounts}
          loading={store.loading}
          page={page}
          platformConfig={platformConfig}
          onRefreshAccounts={() => void store.fetchAccounts()}
        />
      )}
      {launchModal && (
        <div className="modal-overlay">
          <div
            className="modal modal-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <button
                className="btn btn-secondary icon-only"
                onClick={() => setLaunchModal(null)}
                title={t("common.back", "返回")}
                aria-label={t("common.back", "返回")}
              >
                <ChevronLeft size={14} />
              </button>
              <h2>{t("grok.instances.launchDialogTitle", "启动实例")}</h2>
              <button
                className="modal-close"
                onClick={() => setLaunchModal(null)}
                aria-label={t("common.close", "关闭")}
              >
                <X />
              </button>
            </div>
            <div className="modal-body">
              <div className="add-status success">
                <Check size={16} />
                <span>
                  {t("accounts.switched", "已切换至 {{email}}", {
                    email: launchModal.accountEmail,
                  })}
                </span>
              </div>
              <ModalErrorMessage
                message={launchModal.executeError}
                scrollKey={launchModal.errorScrollKey}
              />
              {launchModal.executeError && renderGrokCliInstallGuide()}
              <div className="form-group">
                <label>{t("instances.columns.instance", "实例")}</label>
                <input
                  className="form-input"
                  value={t("instances.defaultName", "默认实例")}
                  readOnly
                />
              </div>
              <div className="form-group">
                <label>{t("instances.launchDialog.command", "启动命令")}</label>
                <textarea
                  className="form-input instance-args-input"
                  value={launchModal.launchCommand}
                  readOnly
                />
                <p className="form-hint">
                  {t(
                    "grok.instances.launchHint",
                    "可复制命令手动执行，或点击下方按钮直接在终端执行。",
                  )}
                </p>
              </div>
              <div className="form-group">
                <label>{t("instances.launchDialog.terminal", "终端")}</label>
                <SingleSelectDropdown
                  value={selectedTerminal}
                  onChange={handleTerminalChange}
                  options={terminalOptions}
                  disabled={launchModal.executing}
                  ariaLabel={t("instances.launchDialog.terminal", "终端")}
                />
              </div>
              {launchModal.executeMessage && (
                <div className="add-status success">
                  <Check size={16} />
                  <span>{launchModal.executeMessage}</span>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={handleCopyLaunchCommand}
                disabled={!launchModal.launchCommand}
              >
                <Copy size={16} />
                {launchModal.copied
                  ? t("common.success", "成功")
                  : t("common.copy", "复制")}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleExecuteInTerminal}
                disabled={launchModal.executing}
              >
                <Play size={16} />
                {launchModal.executing
                  ? t("common.loading", "加载中...")
                  : t("grok.instances.runInTerminal", "终端执行")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
