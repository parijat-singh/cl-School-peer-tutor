/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"DM Serif Display"', "Georgia", "serif"],
        body: ['"DM Sans"', "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          50:  "#EBF0FF",
          100: "#D6E4FF",
          200: "#ADC8FF",
          300: "#84ABFF",
          400: "#5B8FFF",
          500: "#0055FF",
          600: "#0044CC",
          700: "#003399",
          800: "#002266",
          900: "#001133",
        },
        navy: {
          DEFAULT: "#0D1B3E",
          light: "#152548",
          mid:   "#1E3460",
        },
      },
      animation: {
        "fade-up": "fadeUp 0.4s ease both",
      },
      keyframes: {
        fadeUp: {
          "0%":   { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
