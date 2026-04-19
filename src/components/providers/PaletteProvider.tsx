import { createContext, useContext, useEffect, useState } from "react";

export interface CustomColors {
  cardBg: string;
  cardHoverBg: string;
  cardBorder: string;
  cardGlow: string;
}

const defaultColors: CustomColors = {
  cardBg: "#141828",
  cardHoverBg: "#1c2238",
  cardBorder: "#6c3fe6",
  cardGlow: "#6c3fe6",
};

interface PaletteContextType {
  colors: CustomColors;
  setColors: (colors: CustomColors) => void;
}

const PaletteContext = createContext<PaletteContextType>({
  colors: defaultColors,
  setColors: () => {},
});

export function PaletteProvider({ children }: { children: React.ReactNode }) {
  const [colors, setColorsState] = useState<CustomColors>(() => {
    try {
      const stored = localStorage.getItem("card-colors");
      return stored ? JSON.parse(stored) : defaultColors;
    } catch {
      return defaultColors;
    }
  });

  const setColors = (c: CustomColors) => {
    setColorsState(c);
    localStorage.setItem("card-colors", JSON.stringify(c));
  };

  return (
    <PaletteContext.Provider value={{ colors, setColors }}>
      {children}
    </PaletteContext.Provider>
  );
}

export const usePalette = () => useContext(PaletteContext);
export const defaultPaletteColors = defaultColors;

/** Preset palettes users can pick as starting points */
export const presets: { name: string; colors: CustomColors }[] = [
  { name: "Midnight", colors: { cardBg: "#141828", cardHoverBg: "#1c2238", cardBorder: "#6c3fe6", cardGlow: "#6c3fe6" } },
  { name: "Ocean", colors: { cardBg: "#142233", cardHoverBg: "#1a2e42", cardBorder: "#29b6c8", cardGlow: "#29b6c8" } },
  { name: "Ember", colors: { cardBg: "#211510", cardHoverBg: "#2e1e17", cardBorder: "#e87c1e", cardGlow: "#e87c1e" } },
  { name: "Forest", colors: { cardBg: "#0f1f17", cardHoverBg: "#162d21", cardBorder: "#3daa6f", cardGlow: "#3daa6f" } },
  { name: "Neon", colors: { cardBg: "#19102a", cardHoverBg: "#221638", cardBorder: "#e63daa", cardGlow: "#e63daa" } },
  { name: "Ruby", colors: { cardBg: "#211014", cardHoverBg: "#2e171c", cardBorder: "#d94462", cardGlow: "#d94462" } },
  { name: "Gold", colors: { cardBg: "#1a1608", cardHoverBg: "#262010", cardBorder: "#d4a830", cardGlow: "#d4a830" } },
  { name: "Arctic", colors: { cardBg: "#121f29", cardHoverBg: "#1a2d3a", cardBorder: "#7ab8db", cardGlow: "#7ab8db" } },
];
