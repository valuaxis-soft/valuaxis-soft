import assert from "node:assert/strict";
import { test } from "node:test";

import { EmailConfigurationError } from "../src/infrastructure/email/email.errors";
import { buildAmazonSesConfig } from "../src/infrastructure/email/email-service.factory";

function testEnv(values: Record<string, string>): NodeJS.ProcessEnv {
  return values as NodeJS.ProcessEnv;
}

test("ses uses service-specific credentials instead of legacy AWS credentials", () => {
  const config = buildAmazonSesConfig(
    testEnv({
      AWS_SES_REGION: "us-east-1",
      AWS_SES_ACCESS_KEY_ID: "ses-specific-access-key",
      AWS_SES_SECRET_ACCESS_KEY: "ses-specific-secret-key",

      AWS_REGION: "us-west-2",
      AWS_ACCESS_KEY_ID: "legacy-access-key",
      AWS_SECRET_ACCESS_KEY: "legacy-secret-key",

      SES_FROM_EMAIL: "no-reply@example.test",
      SES_FROM_NAME: "Valuaxis Soft",
      APP_URL: "https://app.example.test",
    }),
  );

  assert.equal(config.region, "us-east-1");
  assert.equal(config.accessKeyId, "ses-specific-access-key");
  assert.equal(config.secretAccessKey, "ses-specific-secret-key");
});

test("ses temporarily falls back to legacy AWS credentials", () => {
  const config = buildAmazonSesConfig(
    testEnv({
      AWS_REGION: "us-east-1",
      AWS_ACCESS_KEY_ID: "legacy-access-key",
      AWS_SECRET_ACCESS_KEY: "legacy-secret-key",

      SES_FROM_EMAIL: "no-reply@example.test",
      SES_FROM_NAME: "Valuaxis Soft",
      APP_URL: "https://app.example.test",
    }),
  );

  assert.equal(config.region, "us-east-1");
  assert.equal(config.accessKeyId, "legacy-access-key");
  assert.equal(config.secretAccessKey, "legacy-secret-key");
});

test("ses rejects a service-specific access key without its secret key", () => {
  assert.throws(
    () =>
      buildAmazonSesConfig(
        testEnv({
          AWS_SES_REGION: "us-east-1",
          AWS_SES_ACCESS_KEY_ID: "ses-specific-access-key",

          AWS_REGION: "us-west-2",
          AWS_ACCESS_KEY_ID: "legacy-access-key",
          AWS_SECRET_ACCESS_KEY: "legacy-secret-key",

          SES_FROM_EMAIL: "no-reply@example.test",
          SES_FROM_NAME: "Valuaxis Soft",
          APP_URL: "https://app.example.test",
        }),
      ),
    (error) =>
      error instanceof EmailConfigurationError &&
      error.message.includes("AWS_SES_SECRET_ACCESS_KEY"),
  );
});

test("ses rejects a service-specific secret key without its access key", () => {
  assert.throws(
    () =>
      buildAmazonSesConfig(
        testEnv({
          AWS_SES_REGION: "us-east-1",
          AWS_SES_SECRET_ACCESS_KEY: "ses-specific-secret-key",

          AWS_REGION: "us-west-2",
          AWS_ACCESS_KEY_ID: "legacy-access-key",
          AWS_SECRET_ACCESS_KEY: "legacy-secret-key",

          SES_FROM_EMAIL: "no-reply@example.test",
          SES_FROM_NAME: "Valuaxis Soft",
          APP_URL: "https://app.example.test",
        }),
      ),
    (error) =>
      error instanceof EmailConfigurationError &&
      error.message.includes("AWS_SES_ACCESS_KEY_ID"),
  );
});