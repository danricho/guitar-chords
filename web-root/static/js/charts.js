song_index = 0; // this is global
let currentCapo = 0;

function updateCapoDisplay() {
  $("#capo-display").text(
    currentCapo === 0 ? "Capo: No Capo" : "Capo: Fret #" + currentCapo,
  );
  $("#capo-down").prop("disabled", Boolean(currentCapo <= 0));
  $("#capo-up").prop("disabled", Boolean(currentCapo >= 11));
}

$("#capo-down").on("click", function () {
  if (currentCapo > 0) {
    currentCapo--;
    updateCapoDisplay();
    console.log("Changing to Capo:", currentCapo);
    renderSongChart(
      charts[song_index].chordProChart,
      $("#spotify-ident").text(),
      currentCapo,
    );
  }
});

$("#capo-up").on("click", function () {
  if (currentCapo < 11) {
    currentCapo++;
    updateCapoDisplay();
    console.log("Changing to Capo:", currentCapo);
    renderSongChart(
      charts[song_index].chordProChart,
      $("#spotify-ident").text(),
      currentCapo,
    );
  }
});

$("#prev-song").on("click", function () {
  if (song_index > 0) {
    song_index--;
    renderSongChart(charts[song_index].chordProChart);
    $("#content").animate({ scrollTop: 0 }, 10);
    $("#chart-index").text(song_index + 1);
    $("#charts-available").text(charts.length);
  }
});

$("#next-song").on("click", function () {
  if (song_index < charts.length - 1) {
    song_index++;
    renderSongChart(charts[song_index].chordProChart);
    $("#content").animate({ scrollTop: 0 }, 10);
    $("#chart-index").text(song_index + 1);
    $("#charts-available").text(charts.length);
  }
});

function updateManualButtonStates() {
  $("#prev-song").prop("disabled", song_index <= 0);
  $("#next-song").prop("disabled", song_index >= charts.length - 1);
}

function renderSongChart(chartproStr, spotify_ident = "", capoFret = -1) {
  console.log("renderSongChart()");

  const parser = new ChordSheetJS.ChordProParser();
  let song = parser.parse(chartproStr.trim());

  // Store original (concert) key before any transposition
  const originalKey = song.metadata.get("key");

  // Read capo metadata safely
  const capoMeta = song.metadata.get("capo");
  const originalCapo = Number.isFinite(Number(capoMeta)) ? Number(capoMeta) : 0;

  // Read requested capo safely
  let selectedCapo = Number.isFinite(Number(capoFret)) ? Number(capoFret) : 0;

  if (selectedCapo == -1) {
    selectedCapo = originalCapo;
  }

  currentCapo = selectedCapo;
  updateCapoDisplay();

  song = song.transpose(originalCapo - selectedCapo);

  const playAsKey = song.metadata.get("key");

  const formatter = new ChordSheetJS.HtmlDivFormatter();
  const html = formatter.format(song);

  const chordProFormatter = new ChordSheetJS.ChordProFormatter();

  // console.log(chordProFormatter.format(song)); // I use this to get a transposed version of the chordpro chart

  document.getElementById("song").innerHTML = html;

  // Remove empty lyrics from lines
  $("#song .row").each(function () {
    const $lyrics = $(this).find(".lyrics");

    if (
      $lyrics.filter(function () {
        return $.trim($(this).text()) !== "";
      }).length === 0
    ) {
      $lyrics.remove();
    }
  });

  // Remove completely empty lines
  $("#song .row").each(function () {
    const $row = $(this);

    if (
      $row.filter(function () {
        return $.trim($(this).text()) !== "";
      }).length === 0
    ) {
      $row.remove();
    }
  });

  // convert TS comments to data attribute on the row
  const regex = /^(\d{2}):(\d{2})$/;
  $("#song .comment").each(function () {
    const text = $(this).text().trim();
    const match = text.match(regex);

    if (!match) {
      return;
    }
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const milliseconds = (minutes * 60 + seconds) * 1000;
    $(this).replaceWith(
      $("<div>", {
        class: "event",
        "data-timestamp": milliseconds,
      }),
    );
  });

  $("#song-title").text(song.metadata.get("title") || "");
  $("#song-artist").text(song.metadata.get("artist") || "");
  $("#spotify-ident").text(spotify_ident);
  $("#song-tempo").text((song.metadata.get("tempo") || "") + " BPM");

  // Concert key (what the audience hears)
  $("#song-key").text(originalKey || "");

  // Capo currently selected by the user
  $("#capo-setting").text(selectedCapo === 0 ? "None" : "Fret " + selectedCapo);

  // Key of the chord shapes being displayed
  // $("#current-key").text(playAsKey || '');
  $("#song-info").show();
  $("#song-info-clone").remove();
  let clone = $("#song-info").clone();
  clone.attr("id", "song-info-clone").attr("class", "").css("opacity", "0");
  $("#main-content").prepend(clone);

  let songChords = 0;
  songChords = song.getChords();

  $(".fret-kid-cover").toggle(localStorage.getItem("fret_kidmode") === "on");
  kidSwitch.checked = localStorage.getItem("fret_kidmode") === "on";

  clearChords();
  songChords.forEach((chord) => {
    showChord(chord);
  });

  updateManualButtonStates();
}
