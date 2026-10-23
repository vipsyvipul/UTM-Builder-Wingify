# UTM Builder: Wingify

A one-page tool that builds consistent UTM links for Wingify content: webinars, ebooks, field events and podcasts.

**Live:** https://vipsyvipul.github.io/UTM-Builder-Wingify/
**Value reference:** https://vipsyvipul.github.io/UTM-Builder-Wingify/#matrix

## How to use

1. Pick the **content type** and **funnel stage**, then type the **content name**.
2. Tick every **channel** you will share the link on.
3. Paste the **permalink** from WordPress. Add the **short URL** if you have one.
4. Paste the **Salesforce Campaign ID** (starts with `701`).
5. Click **Copy** next to each link, or **Copy all** to paste the full set into Google Sheets.

Use a separate link for each channel and placement. Don't reuse a LinkedIn link in an email, for example, because then the email's clicks get counted as LinkedIn.

## How links are built

| Parameter | Value |
|---|---|
| `utm_source` | Platform or sender, e.g. `linkedin`, `marketing`, `sdr` |
| `utm_medium` | Channel type, e.g. `social`, `email`, `partner` |
| `utm_campaign` | `{stage}-{type}_{permalink slug}_{Salesforce Campaign ID}`, e.g. `tof-wb_…` |
| `utm_content` | Which post or email, e.g. `company`, `speaker`, `invite` |
| `utm_id` | Salesforce Campaign ID (18 characters) |

Example:

```
https://wingify.com/webinars/discover-the-new-wingify-platform/?utm_source=linkedin&utm_medium=social&utm_campaign=tof-wb_discover-the-new-wingify-platform_701MI000016cpgkYAA&utm_content=company&utm_id=701MI000016cpgkYAA
```

The **Matrix** tab lists every allowed value and how values are grouped.

Why the Salesforce ID is in `utm_campaign` too: Heeet saves `utm_campaign` on the lead but not `utm_id`. Keeping the ID in the campaign value lets Salesforce reports match leads to the exact campaign.

## Short URLs

Short links keep UTMs only if the redirect passes the query string on. Before using short links, test one: open it with `?utm_source=test` added and check that the address bar still shows `utm_source=test`.

## Changing values

All values are defined at the top of the `<script>` in `index.html`:

| To change | Edit |
|---|---|
| Funnel stages and codes | `FUNNEL_STAGES` |
| Content types and codes | `TYPES` |
| Channels, sources, mediums | `CHANNEL_GROUPS` |
| Marketing email `utm_content` values | `EMAIL_CONTENTS` |
| Mediums allowed for "Other" | `OTHER_MEDIUMS` |
| Allowed permalink domains | `ALLOWED_DOMAINS` |

The Builder and Matrix tabs both read from these lists, so one edit updates both.

## Run locally

Open `index.html` in a browser. No build step or dependencies.
