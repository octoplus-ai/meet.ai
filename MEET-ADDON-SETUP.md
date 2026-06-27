# OctoMeet AI — Google Meet Add-on setup (the "exactly like Read.ai" path)

Read.ai's in-meeting experience = **Meet Add-on (UI inside Meet)** + **Meet Media API (botless capture)**.
The Add-on UI is built and hosted (this repo). The Media API is **gated by Google** and must be applied for.

## What's already built (by us)
- **Side panel app:** https://meet-ai-three-beige.vercel.app/meet-addon/ (loads inside Meet; OctoMeet branding + Start/Stop recording + status)
- **Logo:** https://meet-ai-three-beige.vercel.app/octo-logo.png
- Capture today runs through the Recall bot (hybrid); we swap to the Media API once Google approves it.

## STEP 1 — Google Cloud project (ALREADY EXISTS)
Uses the existing project **OctoMeet AI** — Project NUMBER **540014435995**, ID `octomeet-ai`,
org `octoplusteam.com` (the same project as the Google OAuth client). Number is already wired into the add-on.
Just enable these APIs (APIs & Services → Enable APIs & Services):
   - **Google Workspace Marketplace SDK**
   - **Google Workspace Add-ons API**
(OAuth consent screen is already configured for Google login.)

## STEP 2 — Register the Meet Add-on (you, with me)
In the **Google Workspace Marketplace SDK → App Configuration**, add a Meet add-on with this manifest:

```json
{
  "addOns": {
    "common": {
      "name": "OctoMeet AI",
      "logoUrl": "https://meet-ai-three-beige.vercel.app/octo-logo.png"
    },
    "meet": {
      "web": {
        "sidePanelUrl": "https://meet-ai-three-beige.vercel.app/meet-addon/",
        "logoUrl": "https://meet-ai-three-beige.vercel.app/octo-logo.png",
        "darkModeLogoUrl": "https://meet-ai-three-beige.vercel.app/octo-logo.png",
        "addOnOrigins": ["https://meet-ai-three-beige.vercel.app"],
        "supportsScreenSharing": true
      }
    }
  }
}
```

- Set **App visibility = Private / your domain** → installs only for you, **no Google review** needed for testing.
- Click **Install** → the OctoMeet icon appears in your Meet toolbar.

## STEP 3 — Apply to the Meet Media API Developer Preview (you) — START NOW, it's the long pole
This is what makes capture **botless**. It's gated by Google.
- Developer Preview program: https://developers.google.com/workspace/preview
- Meet Media API overview: https://developers.google.com/workspace/meet/media-api/guides/overview
- Enroll: your Cloud project + the app's OAuth principal. ⚠️ Note: **every meeting participant must also be enrolled** in the preview for the Media API to capture — Google's rule, not ours.

## STEP 4 — Botless capture (me, after approval)
Once the Media API is approved, I build the media client (WebRTC) on a persistent server and switch capture from the bot → Media API. Then it's 100% botless, exactly like Read.ai.

---
### Status today
✅ Add-on UI built & hosted · ✅ Recall bot capture working (auto-join, logo, reports) · ⏳ Media API = pending Google approval (botless) · ⏳ needs your Google Cloud project to register the add-on.
