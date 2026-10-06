import crypto from "node:crypto";

// APP_NAME must match this app's ECR repo / IAM role name -- one name ties the whole platform
// integration together, see docs/app-platform.md in nyc_pa_aws_gitops.
export const config = {
  appName: process.env.APP_NAME || "app",
  // The hostname browsers use, for OIDC redirects. Usually
  // <app>.billandjessie.com; mkt-ui is served at mkt.billandjessie.com
  // (Bill, 2026-10-04), so deploy/docker-compose.yml sets PUBLIC_HOST.
  publicHost: process.env.PUBLIC_HOST || `${process.env.APP_NAME || "app"}.billandjessie.com`,
  port: parseInt(process.env.PORT || "8000", 10),

  // Signs the login session cookie. SESSION_SECRET (SSM
  // /home-platform/mkt-ui/session-secret) wins if set; otherwise it's derived
  // from the Authentik client secret, which the platform generates and only
  // this app and Authentik hold, so no extra parameter is needed. The dev
  // default is used only when login is off (local runs and tests).
  sessionSecret: sessionSecret(),

  // mkt-api, the market data API (internal: no route of its own). The server
  // calls it for the signed-in user; the browser never does directly.
  mktApiUrl: process.env.MKT_API_URL || "http://mkt-api:8000",
  mktApiTimeoutMs: parseInt(process.env.MKT_API_TIMEOUT_MS || "20000", 10),

  // Authentik OIDC (ADR-0017, Pattern A). Both unset means auth stays off
  // entirely (app runs fully open) -- lets this template run standalone
  // before an app is actually onboarded to Authentik.
  authentikBaseUrl: process.env.AUTHENTIK_BASE_URL || "https://auth.billandjessie.com",
  authentikClientId: process.env.AUTHENTIK_CLIENT_ID || null,
  authentikClientSecret: process.env.AUTHENTIK_CLIENT_SECRET || null,
  // Authentik's per-application issuer, trailing slash included: openid-client
  // 6 (express-openid-connect 3) compares the discovered issuer exactly, and
  // without the slash every login failed with "discovered metadata issuer
  // does not match the expected issuer".
  issuerUrl: `${process.env.AUTHENTIK_BASE_URL || "https://auth.billandjessie.com"}/application/o/${process.env.APP_NAME || "app"}/`,
};

function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.AUTHENTIK_CLIENT_SECRET) {
    return crypto.createHmac("sha256", process.env.AUTHENTIK_CLIENT_SECRET).update("mkt-ui session cookie").digest("hex");
  }
  return "dev-insecure-secret-change-me";
}
