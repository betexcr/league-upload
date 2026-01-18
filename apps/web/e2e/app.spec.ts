import { expect, test } from "@playwright/test";
import { fileURLToPath } from "url";

test.describe("League Uploads UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
    });
  });

  test("logs in, loads documents, and stays open after opening upload panel", async ({
    page,
  }, testInfo) => {
    const uploadFile = fileURLToPath(
      new URL("../../../docs/assets/dummy.pdf", import.meta.url)
    );
    const errors: string[] = [];
    const logs: string[] = [];
    let crashed = false;
    let closed = false;
    page.on("pageerror", (error) => {
      errors.push(error.message);
      logs.push(`[pageerror] ${error.message}`);
      if (error.stack) {
        logs.push(error.stack);
      }
    });
    page.on("console", (msg) => {
      logs.push(`[console:${msg.type()}] ${msg.text()}`);
    });
    page.on("requestfailed", (request) => {
      const failure = request.failure();
      logs.push(
        `[requestfailed] ${request.method()} ${request.url()} ${failure?.errorText ?? ""}`
      );
    });
    page.on("response", (response) => {
      if (response.status() >= 400) {
        logs.push(`[response:${response.status()}] ${response.url()}`);
      }
    });
    page.on("crash", () => {
      crashed = true;
      logs.push("[crash] page crashed");
    });
    page.on("close", () => {
      closed = true;
      logs.push("[close] page closed");
    });

    try {
      await page.goto("/");

      await expect(
        page.getByRole("heading", { name: /sign in to league uploads/i })
      ).toBeVisible();

      await page.getByLabel("Email").fill("member@league.test");
      await page.getByLabel("User").check();
      await page.getByRole("button", { name: /sign in/i }).click();

      await expect(
        page.getByRole("button", { name: /log out/i })
      ).toBeVisible();

      await expect(
        page.getByRole("heading", { name: "Documents", level: 2 })
      ).toBeVisible();

      await page.waitForResponse((response) => {
        return response.url().includes("/documents") && response.status() === 200;
      });

      const galleryButtons = page.getByRole("button", { name: /open/i });
      if ((await galleryButtons.count()) > 0) {
        await expect(galleryButtons.first()).toBeVisible();
      }

      const details = page.locator("details", { hasText: "Upload documents" });
      await details.locator("summary").click();
      await expect(details).toHaveAttribute("open", "");
      await page.locator('input[type="file"]').setInputFiles(uploadFile);
      await expect(
        details.getByRole("heading", { name: "Metadata" })
      ).toBeVisible();
      await page.getByRole("button", { name: "Save" }).click();

      await page.waitForTimeout(60000);

      expect(page.isClosed()).toBe(false);
      expect(closed).toBe(false);
      expect(crashed).toBe(false);
      expect(errors).toEqual([]);
    } finally {
      await testInfo.attach("browser-logs", {
        body: logs.join("\n"),
        contentType: "text/plain",
      });
    }
  });

  test("shows document thumbnails and preview media", async ({ page }, testInfo) => {
    const logs: string[] = [];
    page.on("console", (msg) => {
      logs.push(`[console:${msg.type()}] ${msg.text()}`);
    });
    page.on("requestfailed", (request) => {
      const failure = request.failure();
      logs.push(
        `[requestfailed] ${request.method()} ${request.url()} ${failure?.errorText ?? ""}`
      );
    });
    page.on("response", (response) => {
      if (response.status() >= 400) {
        logs.push(`[response:${response.status()}] ${response.url()}`);
      }
    });

    try {
      await page.goto("/");
      await page.getByLabel("Email").fill("member@league.test");
      await page.getByLabel("User").check();
      await page.getByRole("button", { name: /sign in/i }).click();

      await expect(
        page.getByRole("heading", { name: "Documents", level: 2 })
      ).toBeVisible();

      await page.waitForResponse((response) => {
        return response.url().includes("/documents") && response.status() === 200;
      });

      const items = page.getByRole("listitem");
      await expect(items.first()).toBeVisible();

      let foundMedia = false;
      const itemCount = await items.count();
      for (let index = 0; index < Math.min(itemCount, 6); index += 1) {
        const item = items.nth(index);
        const img = item.locator("img");
        const pdfObject = item.locator('object[type="application/pdf"]');
        if ((await img.count()) > 0) {
          await expect(img.first()).toBeVisible({ timeout: 30000 });
          foundMedia = true;
          break;
        }
        if ((await pdfObject.count()) > 0) {
          await expect(pdfObject.first()).toBeVisible({ timeout: 30000 });
          foundMedia = true;
          break;
        }
      }

      if (!foundMedia) {
        throw new Error("No visible preview media found in document cards.");
      }

      const openButton = page.getByRole("button", { name: /^open$/i }).first();
      await openButton.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      const dialogImg = dialog.locator("img");
      const dialogPdf = dialog.locator('object[type="application/pdf"]');
      if ((await dialogImg.count()) > 0) {
        await expect(dialogImg.first()).toBeVisible({ timeout: 30000 });
      } else if ((await dialogPdf.count()) > 0) {
        await expect(dialogPdf.first()).toBeVisible({ timeout: 30000 });
      } else {
        throw new Error("No preview media found in preview dialog.");
      }
    } finally {
      await testInfo.attach("preview-logs", {
        body: logs.join("\n"),
        contentType: "text/plain",
      });
    }
  });
});
