/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{liquid,md}"],
  theme: {
    extend: {
      height: {
        svh: "100svh", // small viewport height
        lvh: "100lvh", // large viewport height
        dvh: "100dvh", // dynamic viewport height
      },
      minHeight: {
        svh: "100svh",
      },
    },
  },
  extend: {},
}