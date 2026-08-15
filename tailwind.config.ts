import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        lift: "0 18px 40px rgba(15, 23, 42, 0.14)"
      }
    }
  },
  plugins: []
};

export default config;
