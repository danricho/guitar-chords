<div align="center">

<img src="readme-graphics/logo.svg"/>

# Guitar Chords

</div>

A lightweight web application for guitarists that renders ChordPro Song Charts and synchronises them with Spotify playback.

Designed for practising with real recordings, Guitar Chords can automatically load Song Charts, display Fretboard Chord Diagrams, and scroll in time with the currently playing track.

## Features

- Render ChordPro Song Charts directly in the browser.
- Spotify integration using the Spotify Web API.
- Automatic Song Chart loading based on the currently playing Spotify track.
- Timestamp-based Song Chart synchronisation.
- Percentage-based fallback synchronisation when timestamps are not present.
- Fretboard Chord Diagrams displayed alongside Song Charts, including barre chords.
- Chord transposition via Capo adjustment controls.
- Optional 'capo-change' song for spotify playlists.
- Shareable deep links: the URL carries a `?chart=<slug>` argument for the loaded Song Chart, and the page title shows the song and artist. A share button (shown only where the browser supports the Web Share API) opens the native share sheet with a "Play along to &lt;song&gt; by &lt;artist&gt; on Guitar Chords!" message and the deep link.
- Dark and light themes.
- Kid-friendly three-string chord display mode.
- Responsive tablet-friendly layout.
- Local storage of user preferences.
- iOS "Add to Home Screen" support for a near full-screen experience.

## Screenshots

<img src="readme-graphics/ipad-landscape-spotify.png"/>

_More Screenshots on different devices / orientations are available in the `readme-graphics` directory._

## How It Works

Song Charts are written in ChordPro format and manually registered with the application.

When Spotify playback changes:

1. The current track is read using the Spotify Web API.
2. The application searches for a matching Song Chart.
3. The Song Chart is loaded automatically.
4. Scrolling is synchronised to the current playback position.
5. Fretboard Chord Diagrams and song metadata are also displayed.

## Chord Transposition

Guitar Chords is designed for musicians who want to play along with recordings while using familiar chord shapes.

The capo controls alter the displayed chords without changing the perceived key.

Combined with using the capo as set, this allows players to:

- Use easier chord shapes (or those learnt while learning)
- Match the original recording.
- Play songs in alternative positions on the neck.
- Quickly experiment with different capo locations.

## Fretboard Chord Diagram Library

Guitar Chords includes a lightweight built-in Fretboard Chord Diagram library that displays fretboard positions for recognised chords found within a Song Chart.

When a Song Chart is loaded, any supported chords are automatically displayed alongside the lyrics to provide a quick visual reference while playing.

### Unknown Chords

If a chord appears in a Song Chart but does not exist in the current chord library, a placeholder indicator is displayed instead of a Fretboard Chord Diagram.

The Song Chart itself will continue to render normally.

### Kid Mode

A simplified "Kid Mode" is available for younger players and beginners using three-stringed guitars (eg. Loog).

This mode reduces the complexity of displayed Fretboard Chord Diagrams by presenting a simplified three-string view, making it easier to focus on essential finger placement while learning basic chord transitions.

## Built With

- HTML5
- JavaScript (ES6)
- [jQuery](https://github.com/jquery/jquery)
- [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss)
- [Basecoat](https://github.com/hunvreus/basecoat)
- [ChordSheetJS](https://github.com/martijnversluis/ChordSheetJS)
- [Spotify Web API](https://developer.spotify.com/documentation/web-api)

## Setup

### Docker

The application is a static website and can be hosted by any standard web server.

The included `docker-compose.yml` demonstrates a simple self-hosted deployment using Nginx.

```bash
docker compose up -d
```

### Spotify Setup

Spotify functionality is optional.

If no Spotify Client ID is configured (in `web-root/static/js/spotify-settings.js`), the application will continue to function as a standalone Song Chart viewer and the Spotify button will be hidden.

### Creating a Spotify Application

1. Visit the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Create a new application.
3. Copy the generated Client ID.
4. Configure your application's redirect URI.
5. Add the redirect URI to your Spotify application settings.

> [!NOTE]
> Spotify requires HTTPS for the redirect URI and doesn't allow localhost.

Cloudflare Tunnel works well for self-hosted installations.

### Configure Spotify Settings

Update the Spotify configuration file `web-root/static/js/spotify-settings.js`:

```javascript
window.SpotifyConfig = {
  clientId: "", // The Client ID from your Spotify Developer application.
  redirectUri: "", // The redirect URI registered in the Spotify Developer Dashboard.
  playlist: "", // (optional) Playlist URL to add a link near the Spotify button.
  capoChangeSong: "", // (optional) Track ID used to trigger the capo-change reminder screen.
};
```

### Spotify User Access

Spotify applications created in development mode can only be used by approved Spotify accounts.

To allow additional users:

1. Open your Spotify Developer application.
2. Navigate to User Management.
3. Add the Spotify account email addresses that should have access.

## Adding Song Charts

Song Charts are registered manually in `charts/load-charts.js`.

Example:

```javascript
window.charts = [
  {
    // The `name` field should match the Spotify track title and artist.
    // When a matching track is detected, the Song Chart is loaded automatically from the `path` field.
    name: "Lanterns in the Rain - DanRicho feat. ChatGPT",
    path: "../charts/Fiction-LanternsInTheRain.md",
    defaultCapo: 0, // shown as the Song Chart's capo badge in the Song List
  },
];
```

### Why Manual Registration?

Manual Song Chart registration keeps the application compatible with static hosting environments and avoids requiring server-side file discovery.

## ChordPro Song Charts

Song Charts are stored as Markdown files using ChordPro syntax.

### Metadata

```text
{title: Lanterns in the Rain}
{artist: DanRicho feat. ChatGPT}
{capo: None}
{key: G}
{tempo: 92}
```

Supported metadata fields:

| Field  | Description             | Used for                                                    |
| ------ | ----------------------- | ----------------------------------------------------------- |
| title  | Song title              | Displayed as Title                                          |
| artist | Song artist             | Displayed as Artist                                         |
| capo   | Suggested capo position | The starting Capo setting (matches the chords in the Song Chart) |
| key    | Song key                | The key of the song (per the recording being played)        |
| tempo  | Song tempo              | The tempo of the song                                       |

### Sections

Sections help organise Song Charts.

```text
{sov: Verse}
...
{eov}

{soc: Chorus}
...
{eoc}
```

### Chords

Standard ChordPro chord notation is supported.

```text
[G]Morning breaks on an [D]empty street
[Em]Puddles hum beneath my [C]feet
```

### Timestamp Synchronisation

Timestamps are implemented using ChordPro comments.

```text
[G]Morning breaks on an [D]empty street {c: 00:00}
[Em]Puddles hum beneath my [C]feet {c: 00:08}
[G]Clouds drift low but I [D]feel no fear {c: 00:16}
```

When timestamps exist:

- Scrolling follows the supplied timestamps.
- Playback position is synchronised to Spotify.

When timestamps do not exist:

- Scrolling is calculated from the percentage of the Song Chart completed.
- Playback position is calculated from the percentage of the song completed.

## Chord Definitions

Fretboard Chord Diagrams are defined manually within the application in `web-root/static/js/fretboard.js`.

### Open / Non-Barre Chords

A six-character string describes the guitar strings from low E to high E:

```javascript
A: "x02220",
```

Where:

- `x` = muted string
- `0` = open string
- `1–9` = fret number

### Barre Chords

Barre chords use an object with a `strings` field (same format as above) and a `barre` descriptor:

```javascript
F:  { strings: "133211", barre: { fret: 1, from: 1, to: 6 } },
Bm: { strings: "x24432", barre: { fret: 2, from: 2, to: 6 } },
```

| Field        | Description                                             |
| ------------ | ------------------------------------------------------- |
| `strings`    | Full six-character fret spec, same as a non-barre chord |
| `barre.fret` | Fret number where the barre bar is drawn                |
| `barre.from` | First string the barre covers (1 = low E)               |
| `barre.to`   | Last string the barre covers (6 = high e)               |

The `strings` field still encodes every finger position, including the ones lying on the barre fret. The renderer uses `barre.fret`, `from`, and `to` to decide what to draw:

- A filled pill-shaped bar is drawn across strings `from`–`to` at `barre.fret`.
- Any string whose fret number in `strings` matches `barre.fret` **and** falls within `from`–`to` is treated as part of the barre — no individual dot is drawn for it.
- All other fretted positions (higher frets, or strings outside the barre range) are drawn as normal filled dots on top of the bar.

### Extending the Library

Additional chords can be added by extending `Fretboard.CHORD_LOOKUP` in `web-root/static/js/fretboard.js`.

## Known Limitations

- Song Charts must be registered manually.
- Timestamp accuracy depends on Song Chart authoring quality.
- Spotify track naming variations may require manual Song Chart mapping.
- Chord library is not yet exhaustive.

## Roadmap

See the `About / Roadmap` tab in the settings dialog window!

## License

Licensed under the Apache License, Version 2.0.

See `LICENSE` for the full license text.
