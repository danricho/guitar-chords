/**
 * spotify-settings.js — static Spotify integration configuration.
 * Exposes: window.SpotifyConfig
 */

window.SpotifyConfig = {
  clientId: "", // The Client ID from your Spotify Developer application.
  redirectUri: "", // The redirect URI registered in the Spotify Developer Dashboard.
  playlist: "", // (optional) playlist url to add a link near the Spotify button.
  capoChangeSong: "", // (optional) Track that signals "change your capo" instead of rendering a chart.
};
