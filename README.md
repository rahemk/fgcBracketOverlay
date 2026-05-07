# fgcBracketOverlay

This repository provides a local OBS browser-source overlay intended to be a stream-friendly way for displaying start.gg tournament brackets.

---

## Setup

Before running you need to have:

- Node.js installed
- npm installed

Paste your [personal access token](https://developer.start.gg/docs/authentication/) from start.gg in the .env file. 

Start the local server 
```
node .\server.js
```

The overlay will then run at http://localhost:3000

---

## Usage

You can point your browser source to the URL start.gg bracket or event slug. Example:
```
http://localhost:3000/?slug=tournament/the-next-battle-109/event/tekken-8-singles/brackets/2281923/3304748
```
or
```
http://localhost:3000/?slug=tournament/the-next-battle-109/event/tekken-8-singles
```

---

## Customization

The overlay is mainly customized through `public/style.css`.

Basic CSS knowledge is enough to change the look of the overlay.

---

## Notes

The overlay is designed around a fixed `1920x1080` OBS canvas.

If the overlay looks cropped in a normal browser window, this is expected. OBS should still display it correctly when the Browser Source is set to `1920x1080`.

