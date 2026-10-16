import { test, expect } from '@playwright/test';
const alice = { _id: '111111111111111111111111', fullName: 'Alice', email: 'alice@example.com', profilePic: '/avatars/boy/AV1.png', isOnboarded: true, friends: [], nativeLanguage: 'english', learningLanguage: 'spanish' };
const bob = { ...alice, _id: '222222222222222222222222', fullName: 'Bob', email: 'bob@example.com' };
async function mockApi(page, initialUser = null) {
  let user = initialUser;
  const provisions = [];
  let tokenRequests = 0;
  await page.route('**/api/**', async route => {
    const req = route.request();
    const pathname = new URL(req.url()).pathname;
    let status = 200, body = {};
    if (req.method() === 'OPTIONS') body = {};
    else if (pathname === '/api/auth/me') body = { user };
    else if (pathname === '/api/csrf-token') body = { csrfToken: 'browser-test-csrf' };
    else if (pathname === '/api/auth/login') { user = req.postDataJSON().email === bob.email ? bob : alice; body = { user }; }
    else if (pathname === '/api/auth/logout') { user = null; body = { success: true }; }
    else if (pathname === '/api/chat/token') { tokenRequests++; body = { userId: user?._id, token: `chat-${tokenRequests}`, videoToken: `video-${tokenRequests}` }; }
    else if (pathname === '/api/users/friends') body = user?._id === alice._id ? [{ ...bob, fullName: 'Previous account friend' }] : [];
    else if (pathname === '/api/users') body = { recommendedUsers: [] };
    else if (pathname === '/api/users/outgoing-friend-requests') body = { outgoingReqs: [] };
    else if (pathname === '/api/v1/conversations/direct') { provisions.push(req.postDataJSON()); status = 404; body = { message: 'This conversation or call is unavailable.' }; }
    else body = [];
    await route.fulfill({ status, json: body, headers: { 'Access-Control-Allow-Origin': 'http://127.0.0.1:5173', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'content-type,x-csrf-token,idempotency-key', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS' } });
  });
  return provisions;
}
async function login(page, email) {
  await page.getByPlaceholder('Email', { exact: true }).fill(email);
  await page.locator('input[type=password]').fill('test-password');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:5173/');
}
test('login/logout and account switch clear the previous account UI', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await login(page, alice.email);
  await expect(page.getByText('Previous account friend', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, bob.email);
  await expect(page.getByText('Previous account friend', { exact: true })).toHaveCount(0);
});
test('legacy DM URLs surface a recoverable authorization error', async ({ page }, testInfo) => {
  const provisions = await mockApi(page, alice);
  await page.goto(`/chat/${bob._id}`);
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Conversation unavailable');
  await expect(page.getByRole('link', { name: 'Back to friends' })).toBeVisible();
  expect(provisions).toContainEqual({ targetUserId: bob._id });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.locator('body').evaluate(el => el.clientWidth));
  await page.screenshot({ path: testInfo.outputPath('conversation-unavailable.png'), fullPage: true });
});
test('token providers fetch fresh tokens and reject a changed account', async ({ page }) => {
  await mockApi(page, alice);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Log out', exact: true })).toBeVisible();
  const tokens = await page.evaluate(async id => {
    const { tokenProviderFor } = await import('/src/lib/provider-tokens.js');
    window.previousAccountTokenProvider = tokenProviderFor(id);
    return [await window.previousAccountTokenProvider(), await window.previousAccountTokenProvider()];
  }, alice._id);
  expect(tokens[0]).not.toEqual(tokens[1]);
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, bob.email);
  const error = await page.evaluate(async () => {
    try { await window.previousAccountTokenProvider(); return null; }
    catch (cause) { return cause.message; }
  });
  expect(error).toContain('Your account changed');
});
