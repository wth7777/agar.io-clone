# Agar.io Clone

A mobile-first Agar.io clone built with vanilla JavaScript + Canvas. Playable instantly from a public GitHub Pages link.

## Play Now

👉 **[Play the game](https://wth7777.github.io/agar.io-clone/)**

## Features

- **Mobile-first touch controls** - Drag to move, cell smoothly follows your finger
- **Cross-platform** - Works on iOS Safari, Android Chrome, and desktop browsers
- **AI bots** - 8 bots with simple AI that eat food and hunt smaller cells
- **Food system** - 200 food pellets that respawn automatically
- **Smooth camera** - Camera follows player with deadzone and lerp
- **Leaderboard** - Real-time ranking with mass scores
- **Audio** - Procedural ambient loop + eat sound effects (Web Audio API)
- **Clean UI** - Start screen, HUD with mass/leaderboard, death screen
- **No dependencies** - Pure vanilla JS + Canvas, no build step

## Controls

| Platform | Control |
|----------|---------|
| Mobile | Touch & drag - cell follows your finger |
| Desktop | Mouse drag - cell follows cursor |

## How to Play

1. Enter a name (optional) and tap **Play as Guest**
2. Drag anywhere on screen to move your cell toward your finger
3. Eat smaller food pellets and cells to grow
4. Avoid larger cells - they'll eat you!
4. Survive as long as possible and climb the leaderboard

## Technical Details

- **Vanilla JS + Canvas** - No frameworks, no build step
- **Web Audio API** - Procedural ambient loop + eat sound (no external files)
- **RequestAnimationFrame** - Smooth 60fps game loop
- **Pointer Events** - Unified touch/mouse handling
- **Responsive** - Works in portrait and landscape
- **GitHub Pages ready** - Static files only

## Local Development

```bash
# Just open index.html in a browser, or serve locally:
npx serve .
# or
python3 -m http.server 8000
```

## Project Structure

```
agar.io-clone/
├── index.html      # Main HTML
├── style.css       # Styling
├── game.js         # Game logic (single file)
└── README.md       # This file
```

## Deploy to GitHub Pages

1. Push to a repo named `username.github.io` OR enable Pages in repo settings
2. Source: Deploy from `main` branch, `/ (root)` folder
3. Access at `https://username.github.io/repo-name/`

## License

MIT - Feel free to use and modify!