import assert from "node:assert/strict";
import { test } from "node:test";
import { getStorageConfig } from "../src/infrastructure/storage/storage";

test("local storage does not require AWS configuration", () => {
  const config = getStorageConfig({
    STORAGE_DRIVER: "local",
  });

  assert.deepEqual(config, {
    driver: "local",
  });
});

test("s3 uses service-specific credentials instead of legacy AWS credentials", () => {
  const config = getStorageConfig({
    STORAGE_DRIVER: "s3",

    AWS_S3_BUCKET: "valuaxis-soft-development",
    AWS_S3_REGION: "us-east-1",
    AWS_S3_ACCESS_KEY_ID: "s3-specific-access-key",
    AWS_S3_SECRET_ACCESS_KEY: "s3-specific-secret-key",

    AWS_REGION: "us-west-2",
    AWS_ACCESS_KEY_ID: "legacy-access-key",
    AWS_SECRET_ACCESS_KEY: "legacy-secret-key",
  });

  assert.equal(config.driver, "s3");
  assert.equal(config.s3?.bucket, "valuaxis-soft-development");
  assert.equal(config.s3?.region, "us-east-1");
  assert.equal(config.s3?.accessKeyId, "s3-specific-access-key");
  assert.equal(config.s3?.secretAccessKey, "s3-specific-secret-key");
});

test("s3 temporarily falls back to legacy AWS credentials", () => {
  const config = getStorageConfig({
    STORAGE_DRIVER: "s3",

    AWS_S3_BUCKET: "legacy-bucket",
    AWS_REGION: "us-east-2",
    AWS_ACCESS_KEY_ID: "legacy-access-key",
    AWS_SECRET_ACCESS_KEY: "legacy-secret-key",
  });

  assert.equal(config.driver, "s3");
  assert.equal(config.s3?.region, "us-east-2");
  assert.equal(config.s3?.accessKeyId, "legacy-access-key");
  assert.equal(config.s3?.secretAccessKey, "legacy-secret-key");
});

test("s3 rejects a partial service-specific credential pair", () => {
  assert.throws(
    () =>
      getStorageConfig({
        STORAGE_DRIVER: "s3",
        AWS_S3_BUCKET: "valuaxis-soft-development",

        AWS_S3_ACCESS_KEY_ID: "s3-specific-access-key",

        AWS_ACCESS_KEY_ID: "legacy-access-key",
        AWS_SECRET_ACCESS_KEY: "legacy-secret-key",
      }),
    /AWS_S3_ACCESS_KEY_ID y AWS_S3_SECRET_ACCESS_KEY deben configurarse juntas/,
  );
});