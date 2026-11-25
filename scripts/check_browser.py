"""Run against a built, running desk. Requires Python Playwright and Chromium."""
import os
from playwright.sync_api import sync_playwright, expect

with sync_playwright() as runtime:
    browser = runtime.chromium.launch(executable_path=os.getenv("CHROMIUM_PATH"))
    for width in [390, 1366]:
        page = browser.new_page(viewport={"width": width, "height": 840})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(os.getenv("DESK_URL", "http://127.0.0.1:4173"))
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.get_by_text("Receive a delivery and sign a ticket", exact=True).click()
        form = page.locator("#station-form")
        for key, value in {"delivered":"8","crates":"6","low":"2.4","high":"6.7","route":"0x"+"1"*64,"reference":"LOT-27","time":"2026-11-25T09:25"}.items():
            form.locator(f'[name="{key}"]').fill(value)
        form.get_by_label("Reason for held crates").select_option("Packaging damage")
        expect(form.locator("output")).to_contain_text("6 eligible for payment · 2 held")
        form.get_by_role("button").click()
        expect(page.locator("dialog")).to_contain_text("Packaging damage")
        page.locator("#dismiss").click()
        form.locator('[name="crates"]').fill("0")
        expect(form.locator("output")).to_contain_text("Entire load held")
        page.locator("#rehearse").click()
        expect(page.locator("#walk-export")).to_be_visible(timeout=120000)
        expect(page.locator("#walkthrough")).to_contain_text("6 accepted of 8")
        expect(page.locator("#walk-summary")).to_contain_text("3.75 returned")
        assert not errors, errors
        print(f"{width}px: reviewed partial intake, held full load, completed local settlement", flush=True)
        page.close()
    browser.close()
