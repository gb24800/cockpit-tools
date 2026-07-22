import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCnResources from '../locales/zh-CN.json';

type LocaleModule = { default: Record<string, unknown> };

const languageAliases: Record<string, string> = {
  'zh-CN': 'zh-cn',
  'zh-TW': 'zh-tw',
  'en-US': 'en',
  'pt-BR': 'pt-br',
  'vi-VN': 'vi',
  'vi-vn': 'vi',
  'id-ID': 'id',
  'id-id': 'id',
};

// 🔧 精简为仅保留简体中文
export const supportedLanguages = ['zh-cn'];

const localeLoaders: Record<string, () => Promise<LocaleModule>> = {};

const loadedLanguages = new Set<string>();
let initPromise: Promise<void> | null = null;
let i18nBootstrapped = false;

export function normalizeLanguage(lang: string): string {
  const trimmed = lang.trim();
  if (!trimmed) {
    return 'zh-cn';
  }

  if (languageAliases[trimmed]) {
    return languageAliases[trimmed];
  }

  const lower = trimmed.toLowerCase();
  if (languageAliases[lower]) {
    return languageAliases[lower];
  }

  return lower;
}

function resolveSupportedLanguage(lang: string): string {
  const normalized = normalizeLanguage(lang);
  return supportedLanguages.includes(normalized) ? normalized : 'zh-cn';
}

async function ensureLanguageResources(lang: string): Promise<string> {
  const resolved = resolveSupportedLanguage(lang);
  if (loadedLanguages.has(resolved)) {
    return resolved;
  }

  const loader = localeLoaders[resolved];
  if (!loader) {
    loadedLanguages.add(resolved);
    return resolved;
  }
  const module = await loader();
  i18n.addResourceBundle(resolved, 'translation', module.default, true, true);
  loadedLanguages.add(resolved);
  return resolved;
}

function getSavedLanguage(): string {
  try {
    return resolveSupportedLanguage(localStorage.getItem('app-language') || 'zh-cn');
  } catch {
    return 'zh-cn';
  }
}

function getBootstrapLanguage(_savedLanguage: string): string {
  return 'zh-cn';
}

function bootstrapI18n(savedLanguage: string): string {
  if (i18nBootstrapped) {
    return getBootstrapLanguage(savedLanguage);
  }

  const bootstrapLanguage = getBootstrapLanguage(savedLanguage);
  i18n
    .use(initReactI18next)
    .init({
      resources: {
        'zh-cn': { translation: zhCnResources },
      },
      lng: bootstrapLanguage,
      fallbackLng: 'zh-cn',
      supportedLngs: supportedLanguages,
      lowerCaseLng: true,
      load: 'currentOnly',
      initImmediate: false,
      interpolation: {
        escapeValue: false, // React 已经处理了 XSS
      },
    });

  loadedLanguages.add('zh-cn');
  i18nBootstrapped = true;
  return bootstrapLanguage;
}

export async function initI18n(): Promise<void> {
  if (initPromise) {
    return initPromise;
  }

  const savedLanguage = getSavedLanguage();
  const bootstrapLanguage = bootstrapI18n(savedLanguage);

  initPromise = (async () => {
    if (savedLanguage !== bootstrapLanguage) {
      await ensureLanguageResources(savedLanguage);
    }
    if (i18n.language !== savedLanguage) {
      await i18n.changeLanguage(savedLanguage);
    }
  })();

  return initPromise;
}

export async function syncLanguage(lang: string): Promise<string> {
  await initI18n();
  const resolved = await ensureLanguageResources(lang);
  if (i18n.language !== resolved) {
    await i18n.changeLanguage(resolved);
  }
  try {
    localStorage.setItem('app-language', resolved);
  } catch {
    // ignore localStorage write failures
  }
  return resolved;
}

/**
 * 切换语言
 */
export async function changeLanguage(lang: string): Promise<void> {
  await syncLanguage(lang);
}

/**
 * 获取当前语言
 */
export function getCurrentLanguage(): string {
  return normalizeLanguage(i18n.language || 'zh-CN');
}

export default i18n;
