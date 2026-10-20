# AdminCompareShopUI
AdminCompareShopUI

## Authentication configuration

Copy `.env.example` to `.env.local` for local development. The app uses the public Keycloak SPA client `compareshop-admin-ui` in realm `shortlink`, Authorization Code with PKCE S256, and no client secret. The configured API audience and broad role expectation are `compareshop-admin-ui` and `admin`; fine-grained permissions come from `GET /admin/me/permissions`.

Register the app origin's `/auth/callback` as a valid redirect URI and `/login` as a post-logout redirect URI in Keycloak. No tokens or identity claims are persisted in browser storage. Confirm the public-client grant settings, role/audience mappers, web origin, and exact dev redirect/logout URIs in the target realm before runtime rollout.
