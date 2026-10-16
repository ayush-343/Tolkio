// Recognized legacy display names map to BCP 47 tags; unknown values stay intact.
export const LANGUAGES = [
  ["en", "English"],
  ["es", "Spanish"],
  ["fr", "French"],
  ["de", "German"],
  ["pt", "Portuguese"],
  ["hi", "Hindi"],
  ["zh", "Mandarin"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
  ["ru", "Russian"],
  ["ar", "Arabic"],
  ["it", "Italian"],
  ["ta", "Tamil"],
  ["te", "Telugu"],
  ["bn", "Bengali"],
  ["tr", "Turkish"],
  ["nl", "Dutch"],
  ["sv", "Swedish"],
  ["pl", "Polish"],
  ["uk", "Ukrainian"],
  ["vi", "Vietnamese"],
  ["th", "Thai"],
  ["id", "Indonesian"],
  ["el", "Greek"],
  ["he", "Hebrew"],
  ["ur", "Urdu"],
  ["mr", "Marathi"],
  ["gu", "Gujarati"],
  ["pa", "Punjabi"],
  ["ml", "Malayalam"],
  ["kn", "Kannada"],
  ["fi", "Finnish"],
  ["no", "Norwegian"],
  ["da", "Danish"],
  ["ro", "Romanian"],
  ["cs", "Czech"],
  ["hu", "Hungarian"],
  ["sw", "Swahili"],
  ["fa", "Persian"],
  ["ms", "Malay"],
  ["fil", "Filipino"],
].map(([code, label]) => ({ code, label }));
export function languageCode(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return (
    LANGUAGES.find(
      (item) =>
        item.code === normalized || item.label.toLowerCase() === normalized,
    )?.code || (normalized === "chinese" ? "zh" : null)
  );
}
export function languagesOf(user, kind) {
  const entries = user[`${kind}Languages`] || [];
  return [
    ...new Set(
      [...entries.map((e) => e.language), user[`${kind}Language`]]
        .map(languageCode)
        .filter(Boolean),
    ),
  ];
}
