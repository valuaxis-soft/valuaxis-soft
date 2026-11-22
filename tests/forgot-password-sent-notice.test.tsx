import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { PasswordResetSentNotice } from "../src/features/auth/components/forgot-password-form";
import { authErrorMessages } from "../src/features/auth/constants/auth-errors";

test("the sent notice confirms the request and links back to sign in", () => {
  const html = renderToStaticMarkup(<PasswordResetSentNotice />);

  assert.match(html, /role="alert"/);
  assert.match(html, /aria-live="polite"/);
  assert.ok(html.includes(authErrorMessages.PASSWORD_RESET_SENT));
  assert.match(html, /href="\/iniciar-sesion"[^>]*>Volver a iniciar sesión</);
});
