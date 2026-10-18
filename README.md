# MealMate v1.0

Turn your ingredients into great meals. A shared pantry for two phones, with expiry alerts and recipe ideas.

- `docs/` is the app. GitHub Pages serves it.
- `server/` is the backend that runs on the DigitalOcean droplet. It stores the pantry and favourites and fetches recipes from Spoonacular, with TheMealDB as a fallback.

## 1. Put it on GitHub

1. Create a new **public** repository, for example `paulhessle-cyber/mealmate`. GitHub Pages needs a public repo on the free plan, and nothing secret is stored in it.
2. Upload everything in this folder.
3. In the repository, go to **Settings → Pages**. Set the source to *Deploy from a branch*, choose branch `main`, folder **`/docs`**, then Save.
4. The app address will be `https://paulhessle-cyber.github.io/mealmate/`.

## 2. Give the server a web address

This makes `mealmate.screaminge.co.uk` lead to your droplet.

1. Find your droplet's IP address. It's shown next to the droplet in the DigitalOcean app, or you can run `curl -4 ifconfig.me` on the droplet. It looks like `164.90.123.45`.
2. Log in to the company you bought `screaminge.co.uk` from and open its **DNS settings** (sometimes called "Manage DNS" or "DNS records").
3. Add a new record:
   - **Type:** A
   - **Name / Host:** `mealmate`
   - **Value / Points to:** your droplet's IP
   - **TTL:** leave as default
4. Save, then wait 5–30 minutes. The installer in step 3 checks this for you and tells you if it isn't working yet.

## 3. Install the server (on the droplet, over SSH)

```bash
cd ~ && git clone https://github.com/paulhessle-cyber/mealmate.git
cd ~/mealmate/server && sudo bash install.sh
```

The installer asks for:
- the domain
- the app's address (default `https://paulhessle-cyber.github.io`)
- a **household code** that you and your partner will type once on each phone
- your **Spoonacular key**. It's typed directly into the droplet and stored only in `/opt/mealmate/.env`, never in GitHub.

It then sets up a `mealmate` systemd service, an nginx site and an HTTPS certificate.

You'll need Node 18.17 or newer on the droplet. Check with `node -v`.

## 4. Connect the app to the server

If you used a different domain, edit `docs/config.js` and set `apiBase` to it, for example `https://mealmate.screaminge.co.uk`.

## 5. On each iPhone

1. Open the app address in Safari.
2. Tap Share, then **Add to Home Screen**.
3. Open MealMate from the home screen and enter the household code.

## Updating

- **App:** replace the files in `docs/` on GitHub. Bump the `?v=` numbers in `index.html` so Safari loads the new files.
- **Server:** run `cd ~/mealmate/server && git pull && sudo bash install.sh`. This keeps your settings and data.

## Useful commands

```bash
systemctl status mealmate            # is it running?
journalctl -u mealmate -n 50         # recent logs
sudo nano /opt/mealmate/.env         # change code or key, then: sudo systemctl restart mealmate
ls /opt/mealmate/data/backups        # one backup per day, last 14 kept
```

## Notes

- A Spoonacular free account has a daily points limit. One recipe search uses roughly 10–15 points. Results are cached for 6 hours, and opening a recipe from a search uses no extra points. When the limit is reached, MealMate switches to TheMealDB automatically and says so on screen.
- TheMealDB has no cooking times, so the time filter is skipped when it's in use.
- Recipe ingredients are matched to your pantry by name. Salt, pepper, oil and water count as store-cupboard staples.
