"use client";

import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

export type UiLanguage = "en" | "fr";

type UiLanguageContextValue = {
  language: UiLanguage;
  setLanguage: (language: UiLanguage) => void;
};

const UI_LANGUAGE_STORAGE_KEY = "neurocheckout-community-ui-language";
const UiLanguageContext = createContext<UiLanguageContextValue | null>(null);

export function UiLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<UiLanguage>("en");

  useEffect(() => {
    const storedLanguage = window.localStorage.getItem(UI_LANGUAGE_STORAGE_KEY);
    if (storedLanguage === "en" || storedLanguage === "fr") {
      setLanguageState(storedLanguage);
      document.documentElement.lang = storedLanguage;
      return;
    }
    document.documentElement.lang = "en";
  }, []);

  const setLanguage = (nextLanguage: UiLanguage) => {
    setLanguageState(nextLanguage);
    window.localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, nextLanguage);
    document.documentElement.lang = nextLanguage;
  };

  return (
    <UiLanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </UiLanguageContext.Provider>
  );
}

export function useUiLanguage(): UiLanguageContextValue {
  const value = useContext(UiLanguageContext);
  if (!value) throw new Error("useUiLanguage must be used inside UiLanguageProvider");
  return value;
}
