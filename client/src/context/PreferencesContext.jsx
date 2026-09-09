import { createContext, useContext, useEffect, useMemo, useState } from "react";

const PreferencesContext = createContext(null);

const TEXT_KEY = "medikiosk_text_size";
const CONTRAST_KEY = "medikiosk_contrast";

export function PreferencesProvider({ children }) {
  const [textSize, setTextSize] = useState(() => localStorage.getItem(TEXT_KEY) || "normal");
  const [contrast, setContrast] = useState(() => localStorage.getItem(CONTRAST_KEY) || "normal");

  useEffect(() => {
    document.documentElement.dataset.textSize = textSize;
    localStorage.setItem(TEXT_KEY, textSize);
  }, [textSize]);

  useEffect(() => {
    document.documentElement.dataset.contrast = contrast;
    localStorage.setItem(CONTRAST_KEY, contrast);
  }, [contrast]);

  const value = useMemo(
    () => ({
      textSize,
      setTextSize,
      contrast,
      toggleContrast: () => setContrast((current) => (current === "high" ? "normal" : "high")),
    }),
    [textSize, contrast],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error("usePreferences must be used inside PreferencesProvider");
  return context;
}
