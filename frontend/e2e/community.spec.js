import { test, expect } from "@playwright/test";
const alice = {
  _id: "111111111111111111111111",
  fullName: "Alice",
  email: "alice@example.com",
  isOnboarded: true,
  friends: [],
  profilePic: "/avatars/boy/AV1.png",
};
const bobId = "222222222222222222222222",
  circleId = "333333333333333333333333";
async function communityApi(page, { disabled = false, owner = false } = {}) {
  let circle = {
    id: circleId,
    name: "Travel in Spanish",
    description: "Practice holiday conversations with curious learners.",
    languageCode: "es",
    minLevel: "A1",
    maxLevel: "B2",
    topics: ["travel"],
    visibility: "listed",
    status: "active",
    memberCount: 2,
    version: 1,
    syncPending: false,
    membership: owner
      ? {
          role: "owner",
          state: "active",
          version: 1,
          notifications: "mentions",
        }
      : null,
  };
  let report = {
    id: "444444444444444444444444",
    kind: "message",
    circleId,
    targetId: bobId,
    reason: "Repeated personal attacks",
    evidence: { text: "Recorded message evidence" },
    status: "open",
  };
  let banned = false;
  const writes = [];
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname,
      method = req.method();
    let body = {},
      status = 200;
    if (method === "OPTIONS") body = {};
    else if (path === "/api/auth/me") body = { user: alice };
    else if (path === "/api/csrf-token") body = { csrfToken: "test-csrf" };
    else if (path.endsWith("/community/capabilities"))
      body = {
        data: { available: !disabled, canCreate: !disabled, isStaff: owner },
      };
    else if (path === "/api/v1/circles" && method === "GET")
      body = { data: [circle], meta: {} };
    else if (path === "/api/v1/circles" && method === "POST") {
      circle = {
        ...circle,
        ...req.postDataJSON(),
        membership: {
          role: "owner",
          state: "active",
          version: 1,
          notifications: "mentions",
        },
      };
      body = { data: circle };
    } else if (path === `/api/v1/circles/${circleId}`) body = { data: circle };
    else if (path.endsWith("/join")) {
      circle.membership = {
        role: "member",
        state: "active",
        version: 1,
        notifications: "mentions",
      };
      body = { data: circle };
    } else if (path.endsWith("/leave")) {
      circle.membership = {
        role: "member",
        state: "left",
        version: 2,
        notifications: "mentions",
      };
      body = { data: circle };
    } else if (path.endsWith("/members"))
      body = {
        data: [
          { user: alice, role: "owner", state: "active", version: 1 },
          {
            user: { _id: bobId, fullName: "Bob" },
            role: "member",
            state: banned ? "banned" : "active",
            version: 1,
          },
        ],
      };
    else if (path.endsWith(`/members/${bobId}`)) {
      banned = true;
      body = { data: { userId: bobId, state: "banned" } };
    } else if (path.endsWith("/chat")) {
      status = 404;
      body = { error: { message: "Your membership is no longer active." } };
    } else if (path.endsWith("/community/invitations")) body = { data: [] };
    else if (path.endsWith("/blocks")) body = { data: [] };
    else if (path.endsWith("/moderation/reports"))
      body = { data: report ? [report] : [], meta: {} };
    else if (path.endsWith("/actions")) {
      banned = req.postDataJSON().action === "ban";
      report = null;
      body = { data: { status: "resolved" } };
    } else if (path.endsWith("/community/operations")) body = { data: [] };
    else if (path.endsWith("/community/profile"))
      body = { data: { interests: [], availability: [] } };
    else if (path.endsWith("/discovery/partners"))
      body = {
        data: [
          {
            _id: bobId,
            fullName: "Bob",
            reasons: ["Reciprocal language match"],
            nativeLanguage: "Spanish",
            learningLanguage: "English",
            bio: "Learning through conversation.",
          },
        ],
        meta: {},
      };
    else body = { data: [] };
    if (["POST", "PATCH", "DELETE"].includes(method))
      writes.push({
        path,
        body: req.postDataJSON(),
        key: req.headers()["idempotency-key"],
      });
    await route.fulfill({
      status,
      json: body,
      headers: {
        "Access-Control-Allow-Origin": "http://127.0.0.1:5173",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Headers":
          "content-type,x-csrf-token,idempotency-key",
        "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
      },
    });
  });
  return writes;
}
async function noOverflow(page) {
  expect(
    await page
      .locator("body")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
}
test("circle creation, membership, and leave flows use explicit server operations", async ({
  page,
}, testInfo) => {
  const writes = await communityApi(page);
  await page.goto("/circles");
  await expect(
    page.getByRole("heading", { name: "Find your practice circle" }),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("circles.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Create a circle", exact: true })
    .click();
  await page
    .getByLabel("Circle name", { exact: true })
    .fill("Weekend conversations");
  await page
    .getByLabel("What will you practice?")
    .fill("Travel and favourite holiday destinations.");
  await page
    .getByRole("button", { name: "Create circle", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/circles/${circleId}$`));
  await expect(
    page.getByRole("link", { name: "Open group chat" }),
  ).toBeVisible();
  expect(writes.find((w) => w.path === "/api/v1/circles")?.key).toBeTruthy();
  await page.screenshot({
    path: testInfo.outputPath("circle-owner.png"),
    fullPage: true,
  });
  await noOverflow(page);
  // A different member's join/leave actions are tested with a new fixture state.
});
test("join, protected chat recovery, and confirmed leave work on desktop and mobile", async ({
  page,
}, testInfo) => {
  const writes = await communityApi(page);
  await page.goto(`/circles/${circleId}`);
  await page.getByRole("button", { name: "Join circle", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Open group chat" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open group chat" }).click();
  await expect(
    page.getByRole("heading", { name: "Circle chat unavailable" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to circle" }).click();
  await page.getByRole("button", { name: "Leave circle", exact: true }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Join circle", exact: true }),
  ).toBeVisible();
  expect(writes.some((w) => w.path.endsWith("/join"))).toBe(true);
  expect(writes.some((w) => w.path.endsWith("/leave"))).toBe(true);
  await noOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("circle-member.png"),
    fullPage: true,
  });
});
test("scoped moderation submits an audited ban decision", async ({
  page,
}, testInfo) => {
  const writes = await communityApi(page, { owner: true });
  await page.goto("/community/safety");
  await page.getByLabel("Resolution", { exact: true }).selectOption("ban");
  await page
    .getByLabel("Decision note")
    .fill("Reviewed evidence and repeated behavior.");
  await noOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("moderation.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Apply decision" }).click();
  await expect(
    page.getByText("No reports awaiting your review."),
  ).toBeVisible();
  expect(writes.find((w) => w.path.endsWith("/actions"))?.body.action).toBe(
    "ban",
  );
});
test("disabled beta and ranked discovery remain usable and explain boundaries", async ({
  page,
}) => {
  await communityApi(page, { disabled: true });
  await page.goto("/circles");
  await expect(
    page.getByRole("heading", { name: "Community beta" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to friends" })).toBeVisible();
  await noOverflow(page);
});
test("revoked overview access hides cached protected actions and offers recovery", async ({
  page,
}, testInfo) => {
  await communityApi(page, { owner: true });
  await page.goto(`/circles/${circleId}`);
  await expect(
    page.getByRole("link", { name: "Open group chat" }),
  ).toBeVisible();
  await page.route(`**/api/v1/circles/${circleId}`, (route) =>
    route.fulfill({
      status: 404,
      json: { error: { message: "This circle or member is unavailable." } },
      headers: {
        "Access-Control-Allow-Origin": "http://127.0.0.1:5173",
        "Access-Control-Allow-Credentials": "true",
      },
    }),
  );
  await expect(
    page.getByRole("heading", { name: "Circle access unavailable" }),
  ).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("link", { name: "Open group chat" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("circle-access-unavailable.png"),
    fullPage: true,
  });
});
test("ranked discovery exposes direct-contact safety controls", async ({
  page,
}, testInfo) => {
  const writes = await communityApi(page);
  await page.goto("/discover");
  await expect(
    page.getByRole("heading", { name: "Find a conversation partner" }),
  ).toBeVisible();
  await expect(page.getByText("Reciprocal language match", { exact: true })).toBeVisible();
  await page.getByText("Invite ID and safety controls").click();
  await expect(
    page.getByText(
      "Blocking prevents new direct contact. Shared circle conversations remain visible.",
    ),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("discovery.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Block user" }).click();
  await expect.poll(() => writes.some((w) => w.path.endsWith(`/blocks/${bobId}`))).toBe(true);
});
