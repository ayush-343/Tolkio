export const PUBLIC_USER_FIELDS = '_id fullName username bio profilePic nativeLanguage nativeProficiency learningLanguage learningProficiency nativeLanguages learningLanguages location createdAt';
const fields = PUBLIC_USER_FIELDS.split(' ');
export function publicUser(value) {
  if (!value) return null;
  const source = value.toObject ? value.toObject() : value;
  const result = {};
  for (const key of fields) if (source[key] !== undefined) result[key] = source[key];
  result._id = String(source._id);
  for (const key of ['nativeLanguages', 'learningLanguages']) {
    if (Array.isArray(source[key])) result[key] = source[key].map(({ language, proficiency }) => ({ language, proficiency }));
  }
  return result;
}
export function selfUser(value) {
  if (!value) return null;
  const source = value.toObject ? value.toObject() : value;
  return { ...publicUser(value), email: source.email, isOnboarded: source.isOnboarded, friends: (source.friends || []).map(String), updatedAt: source.updatedAt };
}
