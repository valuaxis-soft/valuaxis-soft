import assert from "node:assert/strict";
import { test } from "node:test";
import { SendEmailCommand } from "@aws-sdk/client-sesv2";
import { AmazonSesEmailService, type AmazonSesEmailConfig } from "../src/infrastructure/email/amazon-ses-email.service";
import { DevelopmentEmailService } from "../src/infrastructure/email/development-email.service";
import { EmailConfigurationError, EmailDeliveryError } from "../src/infrastructure/email/email.errors";
import { buildAmazonSesConfig, createEmailService } from "../src/infrastructure/email/email-service.factory";

const config: AmazonSesEmailConfig = {
  region: "us-east-1",
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
  fromEmail: "no-reply@example.test",
  fromName: "Valuo",
};

function testEnv(values: Record<string, string>): NodeJS.ProcessEnv {
  return values as NodeJS.ProcessEnv;
}

test("amazon ses provider sends verification email with expected sender, subject, html and text", async () => {
  const commands: SendEmailCommand[] = [];
  const service = new AmazonSesEmailService(
    {
      async send(command) {
        commands.push(command);
        return { MessageId: "test-message" };
      },
    },
    config,
  );

  await service.sendVerificationEmail({
    to: "person@example.test",
    name: "Persona",
    verificationUrl: "https://app.example.test/verificar-correo?token=abc",
  });

  assert.equal(commands.length, 1);
  const input = commands[0].input;
  assert.equal(input.FromEmailAddress, '"Valuo" <no-reply@example.test>');
  assert.deepEqual(input.Destination?.ToAddresses, ["person@example.test"]);
  assert.equal(input.Content?.Simple?.Subject?.Data, "Verifica tu correo en Valuo");
  assert.match(input.Content?.Simple?.Body?.Text?.Data ?? "", /https:\/\/app\.example\.test/);
  assert.match(input.Content?.Simple?.Body?.Html?.Data ?? "", /<a href=/);
});

test("amazon ses provider sends password reset email with expected subject and body", async () => {
  const commands: SendEmailCommand[] = [];
  const service = new AmazonSesEmailService(
    {
      async send(command) {
        commands.push(command);
        return { MessageId: "test-message" };
      },
    },
    config,
  );

  await service.sendPasswordResetEmail({
    to: "person@example.test",
    name: "Persona",
    resetUrl: "https://app.example.test/restablecer-contrasena?token=abc",
  });

  const sentCommand = commands[0];
  assert.equal(sentCommand?.input.Content?.Simple?.Subject?.Data, "Restablece tu contrasena de Valuo");
  assert.match(sentCommand?.input.Content?.Simple?.Body?.Text?.Data ?? "", /restablece tu contrasena/i);
  assert.match(sentCommand?.input.Content?.Simple?.Body?.Html?.Data ?? "", /Restablecer contrasena/);
});

test("amazon ses provider wraps delivery errors in domain error", async (t) => {
  const errorLog = t.mock.method(console, "error", () => {});
  const service = new AmazonSesEmailService(
    {
      async send() {
        throw new Error("SES rejected request");
      },
    },
    config,
  );

  await assert.rejects(
    () =>
      service.sendVerificationEmail({
        to: "person@example.test",
        name: "Persona",
        verificationUrl: "https://app.example.test/verificar-correo?token=abc",
      }),
    EmailDeliveryError,
  );
  assert.equal(errorLog.mock.callCount(), 1);
});

test("ses config reports missing variables clearly", () => {
  assert.throws(
    () =>
      buildAmazonSesConfig(testEnv({
        EMAIL_PROVIDER: "ses",
        AWS_REGION: "us-east-1",
      })),
    (error) =>
      error instanceof EmailConfigurationError &&
      error.message.includes("AWS_ACCESS_KEY_ID") &&
      error.message.includes("SES_FROM_EMAIL"),
  );
});

test("email service factory selects development provider explicitly", () => {
  const service = createEmailService(testEnv({ EMAIL_PROVIDER: "development" }));
  assert.ok(service instanceof DevelopmentEmailService);
});

test("email service factory selects amazon ses provider explicitly", () => {
  const service = createEmailService(
    testEnv({
      EMAIL_PROVIDER: "ses",
      AWS_REGION: "us-east-1",
      AWS_ACCESS_KEY_ID: "test-access-key",
      AWS_SECRET_ACCESS_KEY: "test-secret-key",
      SES_FROM_EMAIL: "no-reply@example.test",
      SES_FROM_NAME: "Valuo",
      APP_URL: "https://app.example.test",
    }),
    () => ({
      async send() {
        return { MessageId: "test-message" };
      },
    }),
  );

  assert.ok(service instanceof AmazonSesEmailService);
});
