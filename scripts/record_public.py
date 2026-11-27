"""Capture public Aevum verification and export the actual browser screens with narration."""
import json
import os
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright, expect

def render(directory, capture, output):
    clips = []
    subtitles = []
    elapsed = 0.0
    def stamp(t):
        n = round(t * 1000)
        return f"{n//3600000:02}:{n//60000%60:02}:{n//1000%60:02},{n%1000:03}"
    for i, words in enumerate(capture):
        text = directory/f"{i}.txt"
        audio = directory/f"{i}.wav"
        clip = directory/f"{i}.mp4"
        text.write_text(words)
        subprocess.run(["ffmpeg","-loglevel","error","-y","-f","lavfi","-i",f"flite=textfile={text}:voice=slt","-af","apad=pad_dur=0.6","-ar","44100",str(audio)],check=True)
        seconds = float(subprocess.check_output(["ffprobe","-v","quiet","-show_entries","format=duration","-of","csv=p=0",str(audio)]))
        subprocess.run(["ffmpeg","-loglevel","error","-y","-loop","1","-framerate","5","-i",str(directory/f"{i}.png"),"-i",str(audio),"-t",str(seconds),"-c:v","libx264","-threads","2","-tune","stillimage","-crf","26","-pix_fmt","yuv420p","-c:a","aac","-b:a","48k",str(clip)],check=True)
        clips.append(f"file '{clip}'")
        for sentence in words.rstrip(".").split(". "):
            end = elapsed + seconds*(len(sentence)+2)/(len(words)+1)
            subtitles.append(f"{len(subtitles)+1}\n{stamp(elapsed)} --> {stamp(end)}\n{sentence}.\n")
            elapsed = end
    listing, captions = directory/"list.txt", directory/"captions.srt"
    listing.write_text("\n".join(clips)+"\n")
    captions.write_text("\n".join(subtitles))
    subprocess.run(["ffmpeg","-loglevel","error","-y","-f","concat","-safe","0","-i",str(listing),"-i",str(captions),"-map","0:v","-map","0:a","-map","1:s","-c","copy","-c:s","mov_text","-metadata:s:s:0","language=eng","-movflags","+faststart",str(output)],check=True)

def capture(site, destination):
    with TemporaryDirectory() as tmp, sync_playwright() as p:
        directory = Path(tmp)
        browser = p.chromium.launch(executable_path=os.getenv("CHROMIUM_PATH"))
        page = browser.new_page(viewport={"width":1280,"height":900})
        page.goto(site, wait_until="domcontentloaded",timeout=60000)
        print("Browser opened",page.url,page.title(),page.locator("body").inner_text()[:300],flush=True)
        page.wait_for_selector("#verify-pilot",timeout=10000)
        narration = []
        def screen(words):
            page.screenshot(path=directory/f"{len(narration)}.png",animations="disabled")
            narration.append(words)
        page.locator("#verify-pilot").scroll_into_view_if_needed()
        screen("An eight crate invoice arrives at a produce distributor. DockCheck lets accounts payable check what the station accepted and what the carrier has already earned.")
        page.locator("#verify-pilot").click()
        expect(page.locator("#modal-title")).to_have_text("Route reconciled",timeout=150000)
        screen("These are existing public Aevum transactions, freshly checked without a wallet. The buyer funded ten hundredths of a test dollar. The carrier received six hundredths. The remaining four hundredths returned to the buyer. Each row links to a public receipt.")
        page.locator("#audit-invoice-0").click()
        screen("The signed receipt covers six accepted crates. This editable sample invoice claims eight. The station and agent signatures, the fixed payee, and the token transfer were checked against the public contract.")
        form = page.locator("#invoice-form")
        form.locator("button").click()
        result = page.locator("#invoice-output")
        expect(result).to_contain_text("Review needed",ignore_case=True)
        result.scroll_into_view_if_needed()
        screen("The clerk can see the two extra crates on the bill. At the agreed rate, that is two hundredths of a test dollar above the payment. The transaction reference identifies exactly which lot to review.")
        form.locator("[name=quantity]").fill("6")
        form.locator("[name=total]").fill("0.06")
        form.locator("button").click()
        expect(result).to_contain_text("Matched",ignore_case=True)
        result.scroll_into_view_if_needed()
        screen("Correcting the bill to six crates reconciles it to the mined payment. The same lot identifier lets a ledger recognize repeat imports. This demonstration verified existing testnet activity and compared an example invoice.")
        browser.close()
        render(directory,narration,destination)

if __name__ == "__main__":
    capture(sys.argv[1], Path(sys.argv[2]))
