# Big Juicy Suite

All six Big apps in one place, with a look at each one from Home. It holds [Big Minty Finances](https://github.com/dontdoubtdusty/budget), [Big Saucy Recipes](https://github.com/dontdoubtdusty/cooking), [Big Skinny Health](https://github.com/dontdoubtdusty/diet), [Big Tidy Reminders](https://github.com/dontdoubtdusty/reminders), [Big Shiny Rounds](https://github.com/dontdoubtdusty/cleaning) and [Big Healthy Habits](https://github.com/dontdoubtdusty/habits). It's one file (`index.html`) with no build step and no server.

## Features

- Home shows a card for each app with what matters today:
  - **Big Minty:** what's left in the paycheck you're in, what's still to pay, and your next payday
  - **Big Saucy:** meals planned for today, and kitchen items to use up soon
  - **Big Skinny:** calories left (or over) today against your daily target
  - **Big Tidy:** the reminders showing now
  - **Big Shiny:** tasks due at the property you're on, plus low supplies and tours today, or just "Done for the day" or "Day off" once you've clocked out
  - **Big Healthy:** medication doses taken today, what's next, and water
- A dot marks apps that need a look today (reminders waiting, cleaning or a dose due, food to use up, a paycheck over budget), and the banner on Home counts them
- Tap a card, or an app on the Apps tab, to open that app full screen inside the suite. **Suite** at the top (or your phone's Back button) takes you back, and the cards update with anything you changed.
- Open any app on its own from the Apps tab, for example to install it to your home screen by itself
- Rearrange Home: hold a card for a moment until it lifts, then drag it to a new spot. You can also choose which apps show on Home and drag to change their order under **Settings > Home**
- Light, dark and automatic themes, plus a Day/Night option that switches to dark at 6pm and back to light at 6am
- Light haptic ticks when you save, delete, finish or toggle something, and buttons that visibly press in on every tap. Turn haptics off under **Settings > Haptics**.
- Backups of the suite's own settings you can share, download and import
- Optional sync across devices with an email sign-in, which also lets Home show what each app last synced

## Using it

Turn on GitHub Pages for this repo (**Settings > Pages > Deploy from a branch > `main` / root**) and open the link it gives you. The suite finds the other apps next to it on the same site (`../budget/`, `../cooking/` and so on), so it only works from GitHub Pages, alongside the other Big apps' Pages.

### Install it as an app

- **iPhone or iPad (Safari):** tap Share, then **Add to Home Screen**.
- **Android (Chrome):** tap the menu, then **Install app** (or **Add to Home screen**).
- **Computer (Chrome or Edge):** click the install icon at the right end of the address bar.

Once it's installed, it opens full screen with its own icon. The suite itself opens offline, and so does each app you've opened in it before.

### Files

| File | What it does |
| --- | --- |
| `index.html` | The whole app |
| `sync.js` | Optional sync across devices (shared by all the Big apps) |
| `feedback.js` | Haptic ticks and button press feedback (shared by all the Big apps) |
| `manifest.webmanifest` | The app's name, colors and icons, used when it's installed |
| `sw.js` | Saves a copy of the app so it opens offline |
| `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` | The app icon at each size browsers and phones ask for |

**When you update the app:** nothing extra to do. The app always checks for a newer copy first and only falls back to the saved one when you're offline.

## Your data

The suite keeps only its own settings (theme, and which apps show on Home) in your browser's `localStorage`. Each app's data stays with that app: the suite reads it to fill in the Home cards, and never changes it. When you open an app inside the suite, it's the real app, saving its own data exactly as it does on its own.

Where Home looks for each app's data:

- **This browser:** the Big apps all live on the same site, so in the same browser the suite sees what each one saved.
- **Sync:** on iPhone, an app added to the home screen keeps its own storage, separate from Safari and from every other home-screen app, so the suite can't see it there. Sign in under **Settings > Sync across devices** in the suite, and with the same account in each app. Home then also reads the copy each app last synced, and uses whichever copy is newer. Cards that come from the synced copy say so.

If the suite can't make sense of an app's data (for example, after that app changes how it saves things), its card says to open the app instead.

Backups made in the suite only cover the suite's own settings. Back up each app from its own Settings.

## Credits

The fonts are [Fredoka](https://fonts.google.com/specimen/Fredoka) and [Nunito](https://fonts.google.com/specimen/Nunito), loaded from Google Fonts.
