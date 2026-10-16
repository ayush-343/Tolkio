import { z } from 'zod';
const text = max => z.string().trim().min(1).max(max);
export const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/).transform(value => value.toLowerCase());
const proficiency = z.enum(['N', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
const language = text(80);
const languageEntry = z.union([language, z.object({ language, proficiency }).strict()]).transform(value => typeof value === 'string' ? { language: value, proficiency: 'A1' } : value);
export const loginBody = z.object({ email: z.email().max(254).transform(value => value.toLowerCase()), password: z.string().min(1).max(128) }).strict();
export const signupBody = loginBody.extend({ fullName: text(100), password: z.string().min(6).max(128), confirmPassword: z.string().max(128).optional() }).refine(value => value.confirmPassword === undefined || value.password === value.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });
const profileFields = {
  fullName: text(100).optional(), username: z.string().trim().max(40).regex(/^[a-zA-Z0-9_]*$/).optional(),
  email: z.email().max(254).transform(value => value.toLowerCase()).optional(), password: z.string().min(6).max(128).optional(),
  bio: z.string().trim().max(1000).optional(), location: text(120).optional(),
  profilePic: z.string().max(2048).refine(value => value === '' || /^\/avatars\/[a-zA-Z0-9/_.-]+$/.test(value) || /^https:\/\/[^\s]+$/.test(value)).optional(),
  nativeLanguage: language.optional(), learningLanguage: language.optional(), nativeProficiency: proficiency.optional(), learningProficiency: proficiency.optional(),
  nativeLanguages: z.array(languageEntry).max(10).optional(), learningLanguages: z.array(languageEntry).max(10).optional(),
};
export const profileBody = z.object(profileFields).strict().refine(value => Object.keys(value).length > 0);
export const onboardingBody = z.object({ ...profileFields, fullName: text(100), bio: text(1000), location: text(120), nativeLanguage: language, learningLanguage: language }).strict();
export const replyBody = z.object({ channelId: text(100), text: text(2000) }).strict();
export const directBody = z.object({ targetUserId: objectId }).strict();
export const callBody = directBody.extend({ audioOnly: z.boolean().default(false) });
// callerName is accepted for legacy clients, but never trusted or used.
export const callNotificationBody = directBody.extend({ callId: text(100).regex(/^[\w-]+$/), isAudioOnly: z.boolean().optional(), callerName: z.string().max(100).optional() }).strict();
export const pushSubscriptionBody = z.object({ subscription: z.object({
  endpoint: z.url().max(2048).refine(value => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      (['fcm.googleapis.com', 'web.push.apple.com', 'updates.push.services.mozilla.com'].includes(url.hostname) || url.hostname.endsWith('.push.apple.com') || url.hostname.endsWith('.notify.windows.com'));
  }),
  expirationTime: z.number().nonnegative().nullable().optional(),
  keys: z.object({ p256dh: z.string().min(20).max(256).regex(/^[\w-]+$/), auth: z.string().min(10).max(256).regex(/^[\w-]+$/) }).strict(),
}).strict() }).strict();
