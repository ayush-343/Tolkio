# Talkio product
<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
Peer language learners who want conversation partners and small practice communities. Circle owners and moderators manage those communities; configured platform staff handle escalations.

## Product Purpose
Discover a circle, join a conversation, and return to a community for language practice. M1 supplies circles, group chat, partner discovery, and safety workflows.

## Operating Context
A React PWA served through Render, with MongoDB for application permissions and Stream for chat and calls. Work is tested on staging before the user manually promotes it to production.

## Capabilities and Constraints
The approved M1 plan allows all onboarded beta users to create circles. Circles have at most 50 members and listed or invite-only visibility. Text chat is members-only. Staff are configured by server-side user IDs. Group speaking rooms, learning exercises, and AI expansion are later phases. Existing optional on-device AI, direct chat, and calls must continue working.

## Brand Commitments
Preserve Talkio's existing identity and selectable DaisyUI themes. These are scoped product additions, not a redesign.

## Product Principles
- Keep membership and permissions authoritative on the server.
- Explain pending synchronization and offer recovery.
- Protect private conversation access in the API and provider.
- Keep AI optional and local prompts private.

## Accessibility & Inclusion
The approved plan requires responsive layouts, keyboard navigation, accessible controls, and clear loading, error, and permission states.

## Evidence on Hand
Architecture and M1 implementation plan; existing React pages and theme configuration. No claims about community size or learning outcomes are established.
