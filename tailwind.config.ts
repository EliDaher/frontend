import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        app: {
          bg: "var(--app-bg)",
          surface: "var(--app-surface)",
          "surface-muted": "var(--app-surface-muted)",
          border: "var(--app-border)",
          "border-strong": "var(--app-border-strong)",
          backdrop: "var(--app-backdrop)",
          ink: "var(--app-ink)",
          muted: "var(--app-muted)",
          primary: "var(--app-primary)",
          "primary-hover": "var(--app-primary-hover)",
          "primary-soft": "var(--app-primary-soft)",
          "primary-foreground": "var(--app-primary-foreground)",
          success: "var(--app-success)",
          "success-soft": "var(--app-success-soft)",
          warning: "var(--app-warning)",
          "warning-soft": "var(--app-warning-soft)",
          danger: "var(--app-danger)",
          "danger-soft": "var(--app-danger-soft)"
        },
        landing: {
          background: "#F7F6F2",
          surface: "#FFFFFF",
          ink: "#16161A",
          secondary: "#5F5E63",
          muted: "#71726F",
          border: "#E8E6E1",
          indigo: "#5B5FEF",
          "indigo-dark": "#4143D5"
        }
      },
      fontFamily: {
        app: ["var(--font-ibm-plex-arabic)", "var(--font-cairo)", "Arial", "sans-serif"],
        landing: ["var(--font-ibm-plex-arabic)", "var(--font-cairo)", "Arial", "sans-serif"]
      },
      borderRadius: {
        "app-sm": "4px",
        "app-md": "6px",
        "app-lg": "8px",
        "app-xl": "12px",
        landing: "8px",
        "landing-lg": "16px",
        "landing-xl": "24px"
      },
      boxShadow: {
        "app-overlay": "0 10px 28px rgba(22, 22, 26, 0.10)",
        "app-dialog": "0 24px 70px rgba(22, 22, 26, 0.18)",
        lift: "0 18px 40px rgba(15, 23, 42, 0.14)",
        "landing-soft": "0 4px 20px rgba(22, 22, 26, 0.04)",
        "landing-dark": "0 28px 70px rgba(0, 0, 0, 0.34)"
      },
      fontSize: {
        "app-page-title": ["28px", { lineHeight: "1.25", fontWeight: "600" }],
        "app-section-title": ["20px", { lineHeight: "1.35", fontWeight: "600" }],
        "app-panel-title": ["16px", { lineHeight: "1.45", fontWeight: "600" }],
        "app-body": ["15px", { lineHeight: "1.7", fontWeight: "400" }],
        "app-label": ["13px", { lineHeight: "1.45", fontWeight: "600" }],
        "app-table": ["14px", { lineHeight: "1.55", fontWeight: "400" }],
        "app-helper": ["12px", { lineHeight: "1.55", fontWeight: "400" }],
        "app-meta": ["12px", { lineHeight: "1.45", fontWeight: "500" }],
        "landing-display": ["64px", { lineHeight: "1.1", letterSpacing: "0", fontWeight: "600" }],
        "landing-display-mobile": ["40px", { lineHeight: "1.2", letterSpacing: "0", fontWeight: "600" }],
        "landing-headline": ["32px", { lineHeight: "1.25", fontWeight: "600" }],
        "landing-title": ["24px", { lineHeight: "1.3", fontWeight: "500" }],
        "landing-body": ["18px", { lineHeight: "1.6", fontWeight: "400" }],
        "landing-label": ["13px", { lineHeight: "1", letterSpacing: "0", fontWeight: "600" }]
      }
    }
  },
  plugins: []
};

export default config;
