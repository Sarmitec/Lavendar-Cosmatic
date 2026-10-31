const colors = {
  bodyLight: ["#302a32", "#fffaf8"],
  mutedLight: ["#6b606d", "#fffaf8"],
  eyebrowLight: ["#745879", "#fffaf8"],
  buttonLight: ["#ffffff", "#302a32"],
  badgeLight: ["#745879", "#ffffff"],
  footerLight: ["#b9adb8", "#302a32"],
  inputLight: ["#6b606d", "#fffaf8"],
  bodyDark: ["#f7f0f8", "#211a24"],
  mutedDark: ["#c7bac9", "#211a24"],
  eyebrowDark: ["#d4a9df", "#211a24"],
  buttonDark: ["#211a24", "#f7f0f8"],
  badgeDark: ["#f7f0f8", "#382b3b"],
  footerDark: ["#b9adb8", "#171219"],
  inputDark: ["#c7bac9", "#382b3b"],
};

function channel(hex) {
  const value = Number.parseInt(hex, 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
function luminance(hex) {
  const rgb = hex.slice(1).match(/.{2}/g).map(channel);
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
function ratio(foreground, background) {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

let failed = false;
for (const [name, [foreground, background]] of Object.entries(colors)) {
  const value = ratio(foreground, background);
  const pass = value >= 4.5;
  failed ||= !pass;
  console.log(`${name}\t${foreground} on ${background}\t${value.toFixed(2)}:1\t${pass ? "PASS" : "FAIL"}`);
}
if (failed) process.exitCode = 1;
