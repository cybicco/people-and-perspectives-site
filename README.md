# People & Perspectives Podcast - website

Static site (HTML/CSS/JS). Deployed by Cloudflare Pages from `main`.

## Asset sources and licenses
Logos are trademarks of their owners and are shown as media/partner logos. Commons marks the files below as public domain (simple/text logo) unless noted. Confirm usage rights before launch.

| File | Source | License on source page |
|---|---|---|
| logos/n_toi.svg | https://commons.wikimedia.org/wiki/File:The_times_of_india.svg | Public domain |
| logos/n_news18.svg | https://commons.wikimedia.org/wiki/File:New18-logo.svg | Public domain |
| logos/n_ndtv.svg | https://commons.wikimedia.org/wiki/File:NDTV_logo.svg | Public domain |
| logos/n_zeenews.svg | https://commons.wikimedia.org/wiki/File:Zee_news.svg | Public domain |
| logos/n_ht.svg | https://commons.wikimedia.org/wiki/File:Hindustan_Times_logo.svg | Public domain |
| logos/n_bs.svg | https://commons.wikimedia.org/wiki/File:The_Business_Standard_logo.svg | Public domain |
| logos/n_et.svg | https://commons.wikimedia.org/wiki/File:The_Economic_Times_logo.svg | Public domain |
| logos/new_abp_news_logo.svg | https://commons.wikimedia.org/wiki/File:ABP_News_logo.svg | Public domain |
| logos/new_mint_newspaper_logo.svg | https://commons.wikimedia.org/wiki/File:Mint_(newspaper)_logo.svg | Public domain |
| logos/new_deccan_chronicle_logo.png | https://commons.wikimedia.org/wiki/File:Deccan_Chronicle_Logo.png | Public domain |
| logos/new_ani-logo.png | https://commons.wikimedia.org/wiki/File:Ani-logo.png | CC BY-SA 4.0, Sanchit scaledesk (credit in footer) |
| logos/new_zee5-official-logo.jpeg | https://commons.wikimedia.org/wiki/File:Zee5-official-logo.jpeg | Public domain |
| logos/new_forbes_logo.svg | https://commons.wikimedia.org/wiki/File:Forbes_logo.svg | Public domain |
| logos/midday.png | Crop of a screenshot supplied by the site owner (no SVG found) | Owner-supplied |
| logos/cert_*.png | Crops of a screenshot supplied by the site owner | Owner-supplied |
| logo.png, favicon.png, media_*.jpg, bts*.mp4/jpg | Supplied by the site owner | Owner-supplied |

### Stock portraits (placeholders, generic people)
Pexels, free for commercial use, no attribution required (https://www.pexels.com/license/). Photo ids: 7023362, 7562179, 15852285, 15076258, 29847694, 28494844, 31374315, 33971228. Source URLs: `https://images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg`. Replace with real guest photos.

Unused older crops in `logos/` (toi.png, news18.png, ...) can be deleted.

## Media from the client (BTS shoot)
- bts1-bts6.mp4 and the posters: client-supplied behind-the-scenes clips, re-encoded muted (no audio track), 360x640, lazy-loaded. Near-duplicate clips were dropped.
- shot1-shot7.jpg: client-supplied on-set photos (host and guests). Guests appear unnamed. Client to confirm guest consent/release for web use.

- faces/guest1.jpg, faces/guest2.jpg: crops of client-supplied shoot photos of the two guests (man in grey blazer, woman in pink kurta), captioned neutrally as 'Guest'. Pexels stock portraits were removed from the site. Client to confirm guest consent and add names if wanted.

## Phase 3 assets and notes
- `clients/*.webp`: portrait crops from poster images supplied by the site owner (Previous clients & works). Elevate Media branding is cropped out. The wide graphics (`influential`, `astro1`, `astro2`, `doctors`) are crops/resizes of owner-supplied graphics. Names and titles are as shown on those posters. Confirm each person has agreed to be shown before launch.
- `channels/*.jpg`: YouTube channel avatars (Hindustan Times, Zee TV, ABP News, Viral Bhayani, Instant Bollywood) fetched from the public channel pages for display as links to those channels. Subscriber counts shown for the three news channels were read from the public YouTube pages on 22 Oct 2026 and are editable in admin. No affiliation or endorsement is implied by the site; confirm the partnership wording with the owner.
- Studio and partner applications store uploaded files in the database (admin-only access). Dashboards: /studio/ and /partner/. Staff roles: admin, manager, editor.
